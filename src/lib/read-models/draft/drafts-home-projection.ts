import { createRookiePicksOwnedProjection } from "@/lib/read-models/dashboard/rookie-picks-owned-projection";
import { isBlindAuctionWindowActive } from "@/lib/domain/auction/shared";
import { DashboardProjectionDbClient, resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import { DraftHomeProjection } from "@/lib/read-models/draft/types";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { toDraftSummary } from "@/lib/draft";

export function createDraftsHomeProjection(client: DashboardProjectionDbClient = prisma) {
  const rookiePicksProjection = createRookiePicksOwnedProjection(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      actor: {
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
      now?: Date;
    }): Promise<DraftHomeProjection | null> {
      const now = input.now ?? new Date();
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      if (!context?.season) {
        return null;
      }

      const activeRookieDraft = await client.draft.findFirst({
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

      const activeRookieSummary = activeRookieDraft
        ? toDraftSummary(
            {
              id: activeRookieDraft.id,
              leagueId: activeRookieDraft.leagueId,
              seasonId: activeRookieDraft.seasonId,
              type: activeRookieDraft.type,
              status: activeRookieDraft.status,
              title: activeRookieDraft.title,
              currentPickIndex: activeRookieDraft.currentPickIndex,
              startedAt: activeRookieDraft.startedAt,
              completedAt: activeRookieDraft.completedAt,
              createdAt: activeRookieDraft.createdAt,
              updatedAt: activeRookieDraft.updatedAt,
            },
            {
              totalPicks:
                activeRookieDraft._count.draftPicks > 0
                  ? activeRookieDraft._count.draftPicks
                  : activeRookieDraft._count.picks,
              picksMade:
                activeRookieDraft._count.draftPicks > 0
                  ? activeRookieDraft.draftPicks.length
                  : activeRookieDraft.picks.length,
            },
          )
        : null;

      const activeVeteranAuction = await client.draft.findFirst({
        where: {
          leagueId: input.leagueId,
          seasonId: context.season.id,
          type: "VETERAN_AUCTION",
          status: {
            in: ["NOT_STARTED", "IN_PROGRESS"],
          },
        },
        include: {
          _count: {
            select: {
              auctionPlayerPoolEntries: true,
            },
          },
          auctionPlayerPoolEntries: {
            where: {
              status: {
                in: ["AWARDED", "EXPIRED"],
              },
            },
            select: {
              id: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });

      const activeVeteranDraft =
        activeVeteranAuction && activeVeteranAuction.type === "VETERAN_AUCTION"
          ? activeVeteranAuction
          : null;

      const resolvedAuctionEntryCount = Array.isArray(activeVeteranDraft?.auctionPlayerPoolEntries)
        ? activeVeteranDraft.auctionPlayerPoolEntries.length
        : 0;

      const veteranPoolEntryCount = activeVeteranDraft?._count.auctionPlayerPoolEntries ?? 0;

      const activeVeteranSummary = activeVeteranDraft
        ? {
            draft: toDraftSummary(
              {
                id: activeVeteranDraft.id,
                leagueId: activeVeteranDraft.leagueId,
                seasonId: activeVeteranDraft.seasonId,
                type: activeVeteranDraft.type,
                status: activeVeteranDraft.status,
                title: activeVeteranDraft.title,
                currentPickIndex: activeVeteranDraft.currentPickIndex,
                startedAt: activeVeteranDraft.startedAt,
                completedAt: activeVeteranDraft.completedAt,
                createdAt: activeVeteranDraft.createdAt,
                updatedAt: activeVeteranDraft.updatedAt,
              },
              {
                totalPicks: veteranPoolEntryCount,
                picksMade: resolvedAuctionEntryCount,
              },
            ),
            mode: activeVeteranDraft.auctionMode,
            auctionEndsAt: activeVeteranDraft.auctionEndsAt?.toISOString() ?? null,
            poolEntryCount: veteranPoolEntryCount,
            resolvedEntryCount: resolvedAuctionEntryCount,
            blindWindowActive: isBlindAuctionWindowActive({
              auctionEndsAt: activeVeteranDraft.auctionEndsAt,
              now,
            }),
            warningCount:
              activeVeteranDraft.status !== "COMPLETED" &&
              activeVeteranDraft.auctionEndsAt !== null &&
              activeVeteranDraft.auctionEndsAt <= now
                ? 1
                : 0,
          }
        : null;

      const boardWarnings = activeRookieDraft
        ? await client.draftOrderEntry.count({
            where: {
              draftId: activeRookieDraft.id,
              futurePick: {
                overall: null,
              },
            },
          })
        : 0;

      const myRookiePicks =
        input.actor.teamId
          ? await rookiePicksProjection.read({
              leagueId: input.leagueId,
              seasonId: context.season.id,
              teamId: input.actor.teamId,
            })
          : null;

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: {
          id: context.season.id,
          year: context.season.year,
        },
        activeRookieDraft: activeRookieSummary,
        activeVeteranAuction: activeVeteranSummary,
        myRookiePicks:
          myRookiePicks === null
            ? null
            : {
                available: true,
                teamId: myRookiePicks.team.id,
                teamName: myRookiePicks.team.name,
                seasons: myRookiePicks.seasons.map((season) => ({
                  seasonYear: season.seasonYear,
                  totalCount: season.totalCount,
                  rounds: season.rounds.map((round) => ({
                    round: round.round,
                    picks: round.picks.map((pick) => ({
                      id: pick.id,
                      overall: pick.overall,
                      originalTeamName: pick.originalTeam.name,
                    })),
                  })),
                })),
              },
        setupStatus: {
        available: true,
        needsDraftCreation: !activeRookieDraft,
        needsBoardGeneration: activeRookieDraft ? activeRookieDraft._count.draftPicks === 0 : false,
        totalBoardPicks: activeRookieDraft?._count.draftPicks ?? 0,
          warningCount: boardWarnings,
          warnings:
            boardWarnings > 0
              ? [
                  {
                    code: "ROOKIE_ORDER_ESTIMATED",
                    message: "Rookie draft order still has missing pick slots that need commissioner review.",
                  },
                ]
              : [],
        },
        veteranAuctionStatus: {
          available: true,
          needsDraftCreation: !activeVeteranDraft,
          needsPoolGeneration: activeVeteranDraft ? veteranPoolEntryCount === 0 : false,
          totalPoolEntries: veteranPoolEntryCount,
          warningCount: activeVeteranSummary?.warningCount ?? 0,
          warnings:
            activeVeteranSummary && activeVeteranSummary.warningCount > 0
              ? [
                  {
                    code: "AUCTION_STATUS_SYNC_RECOMMENDED",
                    message: "Veteran auction end time has passed. Commissioner status sync is recommended.",
                  },
                ]
              : [],
        },
        links: {
          rookie: "/draft/rookie",
          veteranAuction: "/draft/veteran-auction",
        },
        permissions: {
          canManageRookieDraft: input.actor.leagueRole === "COMMISSIONER",
          canManageVeteranAuction: input.actor.leagueRole === "COMMISSIONER",
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
