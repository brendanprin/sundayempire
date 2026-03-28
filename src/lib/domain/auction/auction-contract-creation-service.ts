import { RosterStatus, TeamSlotType } from "@prisma/client";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { resolveContractStatus } from "@/lib/domain/contracts/shared";
import { acquisitionTypeForAuctionMode, AuctionDbClient } from "@/lib/domain/auction/shared";
import { createRosterAssignmentRepository } from "@/lib/domain/roster-assignment/repository";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { prisma } from "@/lib/prisma";

function defaultBenchLabel(existingBenchCount: number) {
  return `BENCH${existingBenchCount + 1}`;
}

export function createAuctionContractCreationService(client: AuctionDbClient = prisma) {
  const ledgerService = createContractLedgerService(client);
  const rosterAssignmentRepository = createRosterAssignmentRepository(client);
  const teamSeasonStateService = createTeamSeasonStateRecalculationService(client);

  return {
    async createAwardedContract(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      teamId: string;
      playerId: string;
      salary: number;
      yearsTotal: number;
      auctionMode: "STANDARD" | "EMERGENCY_FILL_IN" | null | undefined;
      effectiveAt: Date;
    }) {
      const [team, player, existingContract, existingRosterSlot] = await Promise.all([
        client.team.findFirst({
          where: {
            id: input.teamId,
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        }),
        client.player.findUnique({
          where: {
            id: input.playerId,
          },
          select: {
            id: true,
            name: true,
            position: true,
          },
        }),
        client.contract.findFirst({
          where: {
            seasonId: input.seasonId,
            playerId: input.playerId,
            status: {
              in: ["ACTIVE", "EXPIRING", "TAGGED"],
            },
          },
          select: {
            id: true,
          },
        }),
        client.rosterSlot.findFirst({
          where: {
            seasonId: input.seasonId,
            playerId: input.playerId,
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (!team) {
        throw new Error("TEAM_NOT_FOUND");
      }

      if (!player) {
        throw new Error("PLAYER_NOT_FOUND");
      }

      if (existingContract || existingRosterSlot) {
        throw new Error("PLAYER_ALREADY_ROSTERED");
      }

      const existingBenchCount = await client.rosterSlot.count({
        where: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          slotType: TeamSlotType.BENCH,
        },
      });

      const contract = await client.contract.create({
        data: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          playerId: input.playerId,
          salary: input.salary,
          yearsTotal: input.yearsTotal,
          yearsRemaining: input.yearsTotal,
          startYear: input.seasonYear,
          endYear: input.seasonYear + input.yearsTotal - 1,
          isRookieContract: false,
          rookieOptionEligible: false,
          rookieOptionExercised: false,
          isFranchiseTag: false,
          status: resolveContractStatus({
            yearsRemaining: input.yearsTotal,
            isFranchiseTag: false,
            endedAt: null,
          }),
        },
      });

      const rosterSlot = await client.rosterSlot.create({
        data: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          playerId: input.playerId,
          slotType: TeamSlotType.BENCH,
          slotLabel: defaultBenchLabel(existingBenchCount),
        },
      });

      const rosterAssignment = await rosterAssignmentRepository.createAssignment({
        teamId: input.teamId,
        seasonId: input.seasonId,
        playerId: input.playerId,
        contractId: contract.id,
        rosterStatus: RosterStatus.ACTIVE,
        acquisitionType: acquisitionTypeForAuctionMode(input.auctionMode),
        effectiveAt: input.effectiveAt,
      });

      await ledgerService.syncContractLedger(contract.id);
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: input.teamId,
        seasonId: input.seasonId,
      });

      return {
        team,
        player,
        contract,
        rosterSlot,
        rosterAssignment,
      };
    },
  };
}
