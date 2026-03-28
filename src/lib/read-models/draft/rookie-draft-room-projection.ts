import {
  createAvailableDraftPlayersReader,
  normalizeDraftPlayerPosition,
  normalizeDraftPlayerSortDirection,
  normalizeDraftPlayerSortField,
  normalizeDraftPlayerTier,
} from "@/lib/domain/draft/available-players";
import { createRookieSalaryService } from "@/lib/domain/draft/rookie-salary-service";
import { DashboardProjectionDbClient } from "@/lib/read-models/dashboard/shared";
import { RookieDraftRoomProjection } from "@/lib/read-models/draft/types";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { toDraftSummary } from "@/lib/draft";

export function createRookieDraftRoomProjection(client: DashboardProjectionDbClient = prisma) {
  const availablePlayersReader = createAvailableDraftPlayersReader(client);
  const rookieSalaryService = createRookieSalaryService();

  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      draftId: string;
      actor: {
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
      search?: string | null;
      position?: string | null;
      tier?: string | null;
      sortBy?: string | null;
      sortDir?: string | null;
      availableOnly?: boolean;
      now?: Date;
    }): Promise<RookieDraftRoomProjection | null> {
      const now = input.now ?? new Date();
      const draft = await client.draft.findFirst({
        where: {
          id: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
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
          league: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!draft) {
        return null;
      }

      const board = await client.draftPick.findMany({
        where: {
          draftId: draft.id,
        },
        include: {
          selectingTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          orderEntry: {
            include: {
              owningTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              originalTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
          },
          futurePick: {
            select: {
              id: true,
              seasonYear: true,
              round: true,
              overall: true,
              isUsed: true,
            },
          },
          selection: {
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          },
        },
        orderBy: {
          pickNumber: "asc",
        },
      });

      const currentPickNumber = draft.currentPickIndex + 1;
      const currentPick = board.find((pick) => pick.pickNumber === currentPickNumber) ?? null;
      const isViewerOnTheClock = Boolean(currentPick && input.actor.teamId === currentPick.selectingTeamId);
      const canActOnCurrentPick =
        draft.status === "IN_PROGRESS" &&
        Boolean(currentPick) &&
        (input.actor.leagueRole === "COMMISSIONER" || isViewerOnTheClock);
      const availablePlayers = await availablePlayersReader.list({
        draftId: draft.id,
        seasonId: input.seasonId,
        search: input.search ?? "",
        position: normalizeDraftPlayerPosition(input.position ?? null),
        tier: normalizeDraftPlayerTier(input.tier ?? null),
        sortBy: normalizeDraftPlayerSortField(input.sortBy ?? null),
        sortDir: normalizeDraftPlayerSortDirection(input.sortDir ?? null),
        rostered: false,
        availableOnly: input.availableOnly ?? false,
        rookieEligibleOnly: true,
      });

      const warnings = board.some((pick) => pick.futurePick?.overall === null)
        ? [
            {
              code: "ROOKIE_ORDER_ESTIMATED",
              message: "One or more draft slots are using fallback ordering because future pick slot data is incomplete.",
            },
          ]
        : [];

      return {
        league: draft.league,
        season: {
          id: input.seasonId,
          year: input.seasonYear,
        },
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
        board: board.map((pick) => ({
          id: pick.id,
          pickNumber: pick.pickNumber,
          round: pick.round,
          status: pick.status,
          selectingTeam: pick.selectingTeam,
          owningTeam: pick.orderEntry.owningTeam,
          originalTeam: pick.orderEntry.originalTeam,
          futurePick: pick.futurePick,
          selection: pick.selection
            ? {
                id: pick.selection.id,
                outcome: pick.selection.outcome,
                playerId: pick.selection.playerId,
                playerName: pick.selection.player?.name ?? null,
                playerPosition: pick.selection.player?.position ?? null,
                salary: pick.selection.salary,
                contractYears: pick.selection.contractYears,
                madeAt: pick.selection.madeAt?.toISOString() ?? null,
              }
            : null,
        })),
        currentPick: currentPick
          ? {
              id: currentPick.id,
              pickNumber: currentPick.pickNumber,
              round: currentPick.round,
              status: currentPick.status,
              selectingTeam: currentPick.selectingTeam,
              futurePick: currentPick.futurePick
                ? {
                    id: currentPick.futurePick.id,
                    overall: currentPick.futurePick.overall,
                  }
                : null,
              salaryPreview: rookieSalaryService.salaryForSlot({
                round: currentPick.round,
                pickNumber: currentPick.pickNumber,
              }),
            }
          : null,
        availablePlayers: availablePlayers.map((player) => ({
          id: player.id,
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          age: player.age,
          draftRank: player.draftRank,
          draftTier: player.draftTier,
          isRestricted: player.isRestricted,
          ownerTeam: player.ownerTeam,
        })),
        filters: {
          search: input.search?.trim() ?? "",
          position: normalizeDraftPlayerPosition(input.position ?? null),
          tier: normalizeDraftPlayerTier(input.tier ?? null),
          sortBy: normalizeDraftPlayerSortField(input.sortBy ?? null),
          sortDir: normalizeDraftPlayerSortDirection(input.sortDir ?? null),
          availableOnly: input.availableOnly ?? false,
        },
        warnings,
        permissions: {
          canSelect: canActOnCurrentPick,
          canPass: canActOnCurrentPick,
          canForfeit: draft.status === "IN_PROGRESS" && input.actor.leagueRole === "COMMISSIONER",
          canCorrectOrder: draft.status === "NOT_STARTED" && input.actor.leagueRole === "COMMISSIONER",
        },
        viewer: {
          isOnTheClock: isViewerOnTheClock,
          canActOnCurrentPick,
          isCommissionerOverride: canActOnCurrentPick && !isViewerOnTheClock,
          currentPickTeamName: currentPick?.selectingTeam.name ?? null,
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
