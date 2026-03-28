import { createRookieDraftOrderService } from "@/lib/domain/draft/rookie-draft-order-service";
import { buildDefaultRookieDraftTitle } from "@/lib/domain/draft/shared";
import { DashboardProjectionDbClient, resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import { DraftSetupProjection } from "@/lib/read-models/draft/types";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { toDraftSummary } from "@/lib/draft";

export function createDraftSetupProjection(client: DashboardProjectionDbClient = prisma) {
  const orderService = createRookieDraftOrderService(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      draftId?: string | null;
      actorRole: CanonicalLeagueRole;
      now?: Date;
    }): Promise<DraftSetupProjection | null> {
      const now = input.now ?? new Date();
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.season) {
        return null;
      }

      const teams = await client.team.findMany({
        where: {
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
        orderBy: [{ name: "asc" }],
      });

      const draft =
        input.draftId
          ? await client.draft.findFirst({
              where: {
                id: input.draftId,
                leagueId: input.leagueId,
                seasonId: context.season.id,
                type: "ROOKIE",
              },
              include: {
                _count: {
                  select: {
                    draftPicks: true,
                    picks: true,
                  },
                },
                draftPicks: {
                  where: {
                    status: {
                      not: "PENDING",
                    },
                  },
                  select: {
                    id: true,
                  },
                },
                picks: {
                  where: {
                    madeAt: {
                      not: null,
                    },
                  },
                  select: {
                    id: true,
                  },
                },
              },
            })
          : await client.draft.findFirst({
              where: {
                leagueId: input.leagueId,
                seasonId: context.season.id,
                type: "ROOKIE",
                status: {
                  in: ["NOT_STARTED", "IN_PROGRESS"],
                },
              },
              include: {
                _count: {
                  select: {
                    draftPicks: true,
                    picks: true,
                  },
                },
                draftPicks: {
                  where: {
                    status: {
                      not: "PENDING",
                    },
                  },
                  select: {
                    id: true,
                  },
                },
                picks: {
                  where: {
                    madeAt: {
                      not: null,
                    },
                  },
                  select: {
                    id: true,
                  },
                },
              },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            });

      if (!draft) {
        return {
          league: {
            id: context.league.id,
            name: context.league.name,
          },
          season: {
            id: context.season.id,
            year: context.season.year,
          },
          defaultTitle: buildDefaultRookieDraftTitle(context.season.year),
          draft: null,
          status: {
            needsDraftCreation: true,
            needsBoardGeneration: false,
            estimatedOrderUsed: false,
            warningCount: 0,
          },
          warnings: [],
          entries: [],
          teams,
          permissions: {
            canManage: input.actorRole === "COMMISSIONER",
            canCorrectOrder: input.actorRole === "COMMISSIONER",
          },
          generatedAt: now.toISOString(),
        };
      }

      const state = await orderService.readCurrentState(draft.id);

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: {
          id: context.season.id,
          year: context.season.year,
        },
        defaultTitle: buildDefaultRookieDraftTitle(context.season.year),
        draft: toDraftSummary(
          {
            id: draft.id,
            leagueId: draft.leagueId,
            seasonId: draft.seasonId,
            type: draft.type,
            status: draft.status,
            title: draft.title,
            currentPickIndex: draft.currentPickIndex,
            startedAt: draft.startedAt,
            completedAt: draft.completedAt,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
          },
          {
            totalPicks: draft._count.draftPicks > 0 ? draft._count.draftPicks : draft._count.picks,
            picksMade: draft._count.draftPicks > 0 ? draft.draftPicks.length : draft.picks.length,
          },
        ),
        status: {
          needsDraftCreation: false,
          needsBoardGeneration: state.entries.length === 0,
          estimatedOrderUsed: state.estimatedOrderUsed,
          warningCount: state.warnings.length,
        },
        warnings: state.warnings,
        entries: state.entries.map((entry) => ({
          id: entry.id,
          pickNumber: entry.pickNumber,
          round: entry.round,
          sourceType: entry.sourceType,
          isBonus: entry.isBonus,
          isManualOverride: entry.isManualOverride,
          overrideReason: entry.overrideReason,
          futurePick: entry.futurePick
            ? {
                id: entry.futurePick.id,
                seasonYear: entry.futurePick.seasonYear,
                round: entry.futurePick.round,
                overall: entry.futurePick.overall,
              }
            : null,
          originalTeam: entry.originalTeam,
          owningTeam: entry.owningTeam,
          selectingTeam: entry.selectingTeam,
          draftPick: entry.draftPick
            ? {
                id: entry.draftPick.id,
                status: entry.draftPick.status,
              }
            : null,
        })),
        teams,
        permissions: {
          canManage: input.actorRole === "COMMISSIONER",
          canCorrectOrder: input.actorRole === "COMMISSIONER",
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
