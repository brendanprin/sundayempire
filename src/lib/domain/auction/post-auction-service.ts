import { Prisma } from "@prisma/client";
import { createAuctionContractCreationService } from "@/lib/domain/auction/auction-contract-creation-service";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { AuctionDbClient } from "@/lib/domain/auction/shared";
import { createAvailableDraftPlayersReader } from "@/lib/domain/draft/available-players";
import { logTransaction } from "@/lib/transactions";
import { TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function createPostAuctionService(client: AuctionDbClient = prisma) {
  const availablePlayersReader = createAvailableDraftPlayersReader(client);
  const teamSeasonStateService = createTeamSeasonStateRecalculationService(client);

  return {
    async detectAndExecuteEmergencyFillIn(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      actorUserId?: string | null;
      now?: Date;
    }) {
      const now = input.now ?? new Date();

      // Get league ruleset for roster requirements
      const ruleset = await client.leagueRuleSet.findFirst({
        where: {
          leagueId: input.leagueId,
          isActive: true,
        },
        orderBy: [{ version: "desc" }],
      });

      if (!ruleset) {
        throw new Error("Active ruleset not found for emergency fill-in detection.");
      }

      // Identify teams with short rosters
      const teams = await client.team.findMany({
        where: { leagueId: input.leagueId },
        include: {
          contracts: {
            where: {
              seasonId: input.seasonId,
              status: {
                in: ["ACTIVE", "EXPIRING", "TAGGED"]
              }
            },
          },
        },
      });

      const shortRosterTeams = teams
        .map(team => ({
          id: team.id,
          name: team.name,
          currentRosterCount: team.contracts.length,
          spotsNeeded: Math.max(0, ruleset.rosterSize - team.contracts.length),
        }))
        .filter(team => team.spotsNeeded > 0)
        .sort((a, b) => {
          // Sort by most empty spots first, then by rookie draft order
          if (a.spotsNeeded !== b.spotsNeeded) {
            return b.spotsNeeded - a.spotsNeeded;
          }
          // TODO: Add rookie draft order tie-breaker
          return a.name.localeCompare(b.name);
        });

      if (shortRosterTeams.length === 0) {
        return {
          triggered: false,
          shortRosterTeams: [],
          fillInResults: [],
        };
      }

      // Get available players for emergency fill-in
      const availablePlayers = await availablePlayersReader.list({
        draftId: input.draftId,
        seasonId: input.seasonId,
        search: "",
        rostered: false,
        sortBy: "rank",
        sortDir: "asc",
      });

      if (availablePlayers.length === 0) {
        return {
          triggered: true,
          shortRosterTeams,
          fillInResults: [],
          warning: "No available players for emergency fill-in.",
        };
      }

      // Execute emergency fill-in assignments
      const fillInResults: Array<{
        teamId: string;
        teamName: string;
        playerId: string;
        playerName: string;
        contractId: string;
      }> = [];

      let playerIndex = 0;
      
      // Round-robin assignment to teams needing players
      while (shortRosterTeams.some(team => team.spotsNeeded > 0) && playerIndex < availablePlayers.length) {
        for (const team of shortRosterTeams) {
          if (team.spotsNeeded > 0 && playerIndex < availablePlayers.length) {
            const player = availablePlayers[playerIndex]!;
            
            const contractResult = await prisma.$transaction(async (tx) => {
              const auctionContractCreationService = createAuctionContractCreationService(tx);
              const contractEffects = await auctionContractCreationService.createAwardedContract({
                leagueId: input.leagueId,
                seasonId: input.seasonId,
                seasonYear: 2026, // TODO: Get from season
                teamId: team.id,
                playerId: player.id,
                salary: 1, // Minimum contract per constitution
                yearsTotal: 1,
                auctionMode: "EMERGENCY_FILL_IN",
                effectiveAt: now,
              });

              // Create audit transaction
              await logTransaction(tx, {
                leagueId: input.leagueId,
                seasonId: input.seasonId,
                teamId: team.id,
                playerId: player.id,
                type: TransactionType.ADD,
                summary: `Emergency fill-in awarded ${player.name} to ${team.name}.`,
                metadata: {
                  draftId: input.draftId,
                  salaryAmount: 1,
                  contractYears: 1,
                  emergencyFillIn: true,
                  updatedBy: "post-auction-service emergency",
                },
              });

              return contractEffects;
            });

            fillInResults.push({
              teamId: team.id,
              teamName: team.name,
              playerId: player.id,
              playerName: player.name,
              contractId: contractResult.contract.id,
            });

            team.spotsNeeded -= 1;
            playerIndex += 1;
          }
        }
      }

      // Recalculate team states
      for (const team of shortRosterTeams) {
        if (fillInResults.some(result => result.teamId === team.id)) {
          await teamSeasonStateService.recalculateTeamSeasonState({
            teamId: team.id,
            seasonId: input.seasonId,
          });
        }
      }

      return {
        triggered: true,
        shortRosterTeams,
        fillInResults,
        remainingShortTeams: shortRosterTeams.filter(team => team.spotsNeeded > 0),
      };
    },
  };
}