import { DashboardProjectionDbClient, buildDashboardSeasonSummary, openIssueStatuses } from "@/lib/read-models/dashboard/shared";
import {
  buildDetailIssueSummary,
  buildRosterAssignmentLookup,
  buildTopIssueItems,
  calculateDeadCapEffectiveAmount,
  mapTeamContractSummary,
  selectPreferredContract,
  sortRosterSlots,
} from "@/lib/read-models/detail/shared";
import { TeamCapDetailProjection } from "@/lib/read-models/detail/types";
import { prisma } from "@/lib/prisma";

export function createTeamCapDetailProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      teamId: string;
      seasonId: string;
      now?: Date;
      pickHorizonYears?: number;
      transactionLimit?: number;
    }): Promise<TeamCapDetailProjection | null> {
      const now = input.now ?? new Date();
      const pickHorizonYears = Math.max(0, input.pickHorizonYears ?? 2);
      const transactionLimit = Math.max(1, input.transactionLimit ?? 8);

      const [team, season] = await Promise.all([
        client.team.findUnique({
          where: { id: input.teamId },
          select: {
            id: true,
            leagueId: true,
            name: true,
            abbreviation: true,
            divisionLabel: true,
          },
        }),
        client.season.findUnique({
          where: { id: input.seasonId },
          select: {
            id: true,
            leagueId: true,
            year: true,
            status: true,
            phase: true,
            openedAt: true,
            closedAt: true,
          },
        }),
      ]);

      if (!team || !season || team.leagueId !== season.leagueId) {
        return null;
      }

      const [ruleset, teamSeasonState, rosterSlots, rosterAssignments, contracts, deadCapCharges, issues, picks, transactions] =
        await Promise.all([
          client.leagueRuleSet.findFirst({
            where: {
              leagueId: season.leagueId,
              isActive: true,
            },
            orderBy: {
              version: "desc",
            },
            select: {
              rosterSize: true,
              salaryCapSoft: true,
              salaryCapHard: true,
            },
          }),
          client.teamSeasonState.findUnique({
            where: {
              teamId_seasonId: {
                teamId: team.id,
                seasonId: season.id,
              },
            },
            select: {
              rosterCount: true,
              activeCapTotal: true,
              deadCapTotal: true,
              hardCapTotal: true,
              lastRecalculatedAt: true,
            },
          }),
          client.rosterSlot.findMany({
            where: {
              seasonId: season.id,
              teamId: team.id,
            },
            select: {
              id: true,
              slotType: true,
              slotLabel: true,
              week: true,
              playerId: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  nflTeam: true,
                  injuryStatus: true,
                  isRestricted: true,
                },
              },
            },
          }),
          client.rosterAssignment.findMany({
            where: {
              seasonId: season.id,
              teamId: team.id,
              endedAt: null,
            },
            select: {
              id: true,
              playerId: true,
              contractId: true,
              acquisitionType: true,
              rosterStatus: true,
              hostPlatformReferenceId: true,
              effectiveAt: true,
              endedAt: true,
            },
          }),
          client.contract.findMany({
            where: {
              seasonId: season.id,
              teamId: team.id,
            },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              playerId: true,
              salary: true,
              yearsTotal: true,
              yearsRemaining: true,
              startYear: true,
              endYear: true,
              isRookieContract: true,
              rookieOptionEligible: true,
              rookieOptionExercised: true,
              isFranchiseTag: true,
              status: true,
              endedAt: true,
              createdAt: true,
              updatedAt: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  nflTeam: true,
                },
              },
              seasonLedgers: {
                where: {
                  seasonId: season.id,
                },
                select: {
                  annualSalary: true,
                  yearsRemainingAtStart: true,
                  ledgerStatus: true,
                },
                take: 1,
              },
              franchiseTagUsages: {
                where: {
                  seasonId: season.id,
                },
                select: {
                  id: true,
                  finalTagSalary: true,
                  priorSalary: true,
                },
                take: 1,
              },
              optionDecisions: {
                where: {
                  seasonId: season.id,
                },
                select: {
                  id: true,
                  decisionType: true,
                  effectiveContractYearsAdded: true,
                  decidedAt: true,
                },
                take: 1,
              },
            },
          }),
          client.deadCapCharge.findMany({
            where: {
              leagueId: season.leagueId,
              teamId: team.id,
              appliesToSeason: {
                year: {
                  gte: season.year,
                },
              },
            },
            orderBy: [
              { appliesToSeason: { year: "asc" } },
              { createdAt: "asc" },
            ],
            select: {
              id: true,
              sourceContractId: true,
              sourceEventType: true,
              systemCalculatedAmount: true,
              adjustedAmount: true,
              isOverride: true,
              overrideReason: true,
              createdAt: true,
              appliesToSeason: {
                select: {
                  year: true,
                },
              },
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          }),
          client.complianceIssue.findMany({
            where: {
              leagueId: season.leagueId,
              seasonId: season.id,
              teamId: team.id,
              status: {
                in: openIssueStatuses(),
              },
            },
            select: {
              id: true,
              severity: true,
              status: true,
              code: true,
              title: true,
              dueAt: true,
            },
          }),
          client.futurePick.findMany({
            where: {
              leagueId: season.leagueId,
              currentTeamId: team.id,
              isUsed: false,
              seasonYear: {
                gte: season.year,
                lte: season.year + pickHorizonYears,
              },
            },
            orderBy: [{ seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
            select: {
              id: true,
              seasonYear: true,
              round: true,
              overall: true,
              originalTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
          }),
          client.transaction.findMany({
            where: {
              leagueId: season.leagueId,
              seasonId: season.id,
              teamId: team.id,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: transactionLimit,
            select: {
              id: true,
              type: true,
              summary: true,
              createdAt: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          }),
        ]);

      const assignmentByPlayerId = buildRosterAssignmentLookup(rosterAssignments);
      const contractsByPlayerId = new Map<string, typeof contracts>();
      const contractsById = new Map<string, (typeof contracts)[number]>();

      for (const contract of contracts) {
        const playerContracts = contractsByPlayerId.get(contract.playerId) ?? [];
        playerContracts.push(contract);
        contractsByPlayerId.set(contract.playerId, playerContracts);
        contractsById.set(contract.id, contract);
      }

      const rosterDetails = sortRosterSlots(
        rosterSlots.map((slot) => {
          const assignment = assignmentByPlayerId.get(slot.playerId) ?? null;
          const preferredContract =
            (assignment?.contractId ? contractsById.get(assignment.contractId) : null)
            ?? selectPreferredContract(contractsByPlayerId.get(slot.playerId) ?? []);

          return {
            id: slot.id,
            slotType: slot.slotType,
            slotLabel: slot.slotLabel,
            week: slot.week,
            player: {
              id: slot.player.id,
              name: slot.player.name,
              position: slot.player.position,
              nflTeam: slot.player.nflTeam,
              injuryStatus: slot.player.injuryStatus,
              isRestricted: slot.player.isRestricted,
            },
            assignment: assignment
              ? {
                  id: assignment.id,
                  acquisitionType: assignment.acquisitionType,
                  rosterStatus: assignment.rosterStatus,
                  effectiveAt: assignment.effectiveAt.toISOString(),
                  hostPlatformReferenceId: assignment.hostPlatformReferenceId,
                }
              : null,
            contract: preferredContract ? mapTeamContractSummary(preferredContract) : null,
          };
        }),
      );

      const teamContracts = contracts.map((contract) => ({
        ...mapTeamContractSummary(contract),
        player: {
          id: contract.player.id,
          name: contract.player.name,
          position: contract.player.position,
          nflTeam: contract.player.nflTeam,
        },
      }));

      const deadCapDetails = deadCapCharges.map((charge) => ({
        id: charge.id,
        player: charge.player,
        sourceContractId: charge.sourceContractId,
        sourceEventType: charge.sourceEventType,
        appliesToSeasonYear: charge.appliesToSeason?.year ?? null,
        systemCalculatedAmount: charge.systemCalculatedAmount,
        adjustedAmount: charge.adjustedAmount,
        effectiveAmount: calculateDeadCapEffectiveAmount(charge),
        isOverride: charge.isOverride,
        overrideReason: charge.overrideReason,
        createdAt: charge.createdAt.toISOString(),
      }));

      const issueSummary = buildDetailIssueSummary(issues, now);
      const topIssues = buildTopIssueItems(issues, now, 5);
      const rosterAssignmentCoverageComplete =
        rosterDetails.length === 0
          ? true
          : rosterDetails.every((slot) => slot.assignment !== null);

      return {
        team: {
          id: team.id,
          leagueId: team.leagueId,
          name: team.name,
          abbreviation: team.abbreviation,
          divisionLabel: team.divisionLabel,
        },
        season: buildDashboardSeasonSummary(season),
        capSummary: {
          stateAvailable: Boolean(teamSeasonState),
          mirrorOnly: season.phase === "REGULAR_SEASON",
          rosterCount: teamSeasonState?.rosterCount ?? null,
          rosterLimit: ruleset?.rosterSize ?? null,
          activeCapTotal: teamSeasonState?.activeCapTotal ?? null,
          deadCapTotal: teamSeasonState?.deadCapTotal ?? null,
          hardCapTotal: teamSeasonState?.hardCapTotal ?? null,
          softCapLimit: ruleset?.salaryCapSoft ?? null,
          hardCapLimit: ruleset?.salaryCapHard ?? null,
          capSpaceSoft:
            teamSeasonState && ruleset
              ? ruleset.salaryCapSoft - teamSeasonState.hardCapTotal
              : null,
          capSpaceHard:
            teamSeasonState && ruleset
              ? ruleset.salaryCapHard - teamSeasonState.hardCapTotal
              : null,
          lastRecalculatedAt: teamSeasonState?.lastRecalculatedAt?.toISOString() ?? null,
        },
        roster: {
          starters: rosterDetails.filter((slot) => slot.slotType === "STARTER"),
          bench: rosterDetails.filter((slot) => slot.slotType === "BENCH"),
          injuredReserve: rosterDetails.filter((slot) => slot.slotType === "IR"),
          taxi: rosterDetails.filter((slot) => slot.slotType === "TAXI"),
          totalCount: rosterDetails.length,
        },
        contracts: teamContracts,
        deadCap: {
          currentSeasonTotal: deadCapDetails
            .filter((charge) => charge.appliesToSeasonYear === season.year)
            .reduce((total, charge) => total + charge.effectiveAmount, 0),
          futureCarryTotal: deadCapDetails
            .filter((charge) => (charge.appliesToSeasonYear ?? season.year) > season.year)
            .reduce((total, charge) => total + charge.effectiveAmount, 0),
          charges: deadCapDetails,
        },
        complianceSummary: issueSummary,
        topIssues,
        ownedPicks: picks,
        recentTransactions: transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          summary: transaction.summary,
          createdAt: transaction.createdAt.toISOString(),
          player: transaction.player,
        })),
        availability: {
          rulesetAvailable: Boolean(ruleset),
          teamSeasonStateAvailable: Boolean(teamSeasonState),
          rosterAssignmentCoverageComplete,
          contractHistoryAvailable: false,
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
