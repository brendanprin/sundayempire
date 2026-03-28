import { DashboardProjectionDbClient, buildDashboardSeasonSummary, openIssueStatuses, resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import {
  buildDetailIssueSummary,
  buildTopIssueItems,
  calculateDeadCapEffectiveAmount,
  mapTeamContractSummary,
  selectPreferredContract,
} from "@/lib/read-models/detail/shared";
import { PlayerContractDetailProjection } from "@/lib/read-models/detail/types";
import { prisma } from "@/lib/prisma";

export function createPlayerContractDetailProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      playerId: string;
      seasonId?: string;
      now?: Date;
      transactionLimit?: number;
    }): Promise<PlayerContractDetailProjection | null> {
      const now = input.now ?? new Date();
      const transactionLimit = Math.max(1, input.transactionLimit ?? 8);

      const [context, player] = await Promise.all([
        resolveLeagueSeasonContext(client, {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
        }),
        client.player.findUnique({
          where: { id: input.playerId },
          select: {
            id: true,
            name: true,
            position: true,
            nflTeam: true,
            age: true,
            yearsPro: true,
            injuryStatus: true,
            isRestricted: true,
          },
        }),
      ]);

      if (!context || !player) {
        return null;
      }

      if (!context.season) {
        return {
          league: {
            id: context.league.id,
            name: context.league.name,
          },
          seasonSelection: context.seasonSelection,
          season: null,
          player,
          rosterContext: null,
          contract: null,
          complianceSummary: {
            openIssueCount: 0,
            overdueIssueCount: 0,
            warningCount: 0,
            errorCount: 0,
            criticalCount: 0,
            highestSeverity: null,
          },
          relatedIssues: [],
          recentTransactions: [],
          availability: {
            seasonResolved: false,
            currentSeasonContractAvailable: false,
            rosterAssignmentAvailable: false,
            contractHistoryAvailable: false,
          },
          generatedAt: now.toISOString(),
        };
      }

      const [rosterSlot, rosterAssignment, contracts, transactions] = await Promise.all([
        client.rosterSlot.findFirst({
          where: {
            seasonId: context.season.id,
            playerId: player.id,
            team: {
              leagueId: context.league.id,
            },
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            slotType: true,
            slotLabel: true,
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
        }),
        client.rosterAssignment.findFirst({
          where: {
            seasonId: context.season.id,
            playerId: player.id,
            team: {
              leagueId: context.league.id,
            },
            endedAt: null,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            acquisitionType: true,
            rosterStatus: true,
            hostPlatformReferenceId: true,
            effectiveAt: true,
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
        }),
        client.contract.findMany({
          where: {
            seasonId: context.season.id,
            playerId: player.id,
            team: {
              leagueId: context.league.id,
            },
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            teamId: true,
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
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            seasonLedgers: {
              where: {
                seasonId: context.season.id,
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
                seasonId: context.season.id,
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
                seasonId: context.season.id,
              },
              select: {
                id: true,
                decisionType: true,
                effectiveContractYearsAdded: true,
                decidedAt: true,
              },
              take: 1,
            },
            deadCapCharges: {
              where: {
                appliesToSeason: {
                  year: {
                    gte: context.season.year,
                  },
                },
              },
              orderBy: [
                { appliesToSeason: { year: "asc" } },
                { createdAt: "asc" },
              ],
              select: {
                id: true,
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
              },
            },
          },
        }),
        client.transaction.findMany({
          where: {
            leagueId: context.league.id,
            seasonId: context.season.id,
            playerId: player.id,
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

      const preferredContract = selectPreferredContract(contracts);
      const openIssues = await client.complianceIssue.findMany({
        where: {
          leagueId: context.league.id,
          seasonId: context.season.id,
          status: {
            in: openIssueStatuses(),
          },
          OR: [
            {
              playerId: player.id,
            },
            ...(preferredContract
              ? [
                  {
                    contractId: preferredContract.id,
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          severity: true,
          status: true,
          code: true,
          title: true,
          dueAt: true,
        },
      });

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        seasonSelection: context.seasonSelection,
        season: buildDashboardSeasonSummary(context.season),
        player,
        rosterContext: rosterSlot || rosterAssignment
          ? {
              team: rosterSlot?.team ?? rosterAssignment!.team,
              slotType: rosterSlot?.slotType ?? "BENCH",
              slotLabel: rosterSlot?.slotLabel ?? null,
              assignment: rosterAssignment
                ? {
                    id: rosterAssignment.id,
                    acquisitionType: rosterAssignment.acquisitionType,
                    rosterStatus: rosterAssignment.rosterStatus,
                    effectiveAt: rosterAssignment.effectiveAt.toISOString(),
                    hostPlatformReferenceId: rosterAssignment.hostPlatformReferenceId,
                  }
                : null,
            }
          : null,
        contract: preferredContract
          ? {
              ...mapTeamContractSummary(preferredContract),
              team: preferredContract.team,
              deadCapSchedule: preferredContract.deadCapCharges.map((charge) => ({
                id: charge.id,
                appliesToSeasonYear: charge.appliesToSeason?.year ?? null,
                sourceEventType: charge.sourceEventType,
                systemCalculatedAmount: charge.systemCalculatedAmount,
                adjustedAmount: charge.adjustedAmount,
                effectiveAmount: calculateDeadCapEffectiveAmount(charge),
                isOverride: charge.isOverride,
                overrideReason: charge.overrideReason,
                createdAt: charge.createdAt.toISOString(),
              })),
            }
          : null,
        complianceSummary: buildDetailIssueSummary(openIssues, now),
        relatedIssues: buildTopIssueItems(openIssues, now, 5),
        recentTransactions: transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          summary: transaction.summary,
          createdAt: transaction.createdAt.toISOString(),
          player: transaction.player,
        })),
        availability: {
          seasonResolved: true,
          currentSeasonContractAvailable: Boolean(preferredContract),
          rosterAssignmentAvailable: Boolean(rosterAssignment),
          contractHistoryAvailable: false,
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
