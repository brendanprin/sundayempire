import { Position } from "@prisma/client";
import {
  buildFantasyProsDraftRankingLookup,
  fantasyProsDraftRankingLookupKey,
} from "@/lib/fantasypros-draft-rankings";
import { findMockRookieClassRanking } from "@/lib/mock-rookie-class";
import {
  DraftDbClient,
  isRookieEligibleYearsPro,
  ROOKIE_ELIGIBLE_YEARS_PRO,
} from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";

const VALID_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const draftRankingLookup = buildFantasyProsDraftRankingLookup();

export type DraftPlayerPositionFilter = "ALL" | Position;
export type DraftPlayerTierFilter = "ALL" | "1" | "2" | "3" | "4" | "5_PLUS";
export type DraftPlayerSortField = "rank" | "tier" | "name" | "position" | "age";
export type DraftPlayerSortDirection = "asc" | "desc";

export function normalizeDraftPlayerPosition(value: string | null | undefined): DraftPlayerPositionFilter {
  if (!value || value === "ALL") {
    return "ALL";
  }

  return VALID_POSITIONS.includes(value as Position) ? (value as Position) : "ALL";
}

export function normalizeDraftPlayerSortField(value: string | null | undefined): DraftPlayerSortField {
  if (value === "tier" || value === "name" || value === "position" || value === "age") {
    return value;
  }

  return "rank";
}

export function normalizeDraftPlayerSortDirection(value: string | null | undefined): DraftPlayerSortDirection {
  return value === "desc" ? "desc" : "asc";
}

export function normalizeDraftPlayerTier(value: string | null | undefined): DraftPlayerTierFilter {
  if (value === "1" || value === "2" || value === "3" || value === "4" || value === "5_PLUS") {
    return value;
  }

  return "ALL";
}

export function createAvailableDraftPlayersReader(client: DraftDbClient = prisma) {
  return {
    async list(input: {
      draftId: string;
      seasonId: string;
      search?: string;
      position?: DraftPlayerPositionFilter;
      tier?: DraftPlayerTierFilter;
      sortBy?: DraftPlayerSortField;
      sortDir?: DraftPlayerSortDirection;
      rostered?: boolean;
      availableOnly?: boolean;
      rookieEligibleOnly?: boolean;
    }) {
      const selectedRows = await client.draftSelection.findMany({
        where: {
          draftId: input.draftId,
          playerId: {
            not: null,
          },
        },
        select: {
          playerId: true,
        },
      });
      const selectedPlayerIds = selectedRows
        .map((row) => row.playerId)
        .filter((playerId): playerId is string => Boolean(playerId));

      const players = await client.player.findMany({
        where: {
          ...(selectedPlayerIds.length > 0
            ? {
                id: {
                  notIn: selectedPlayerIds,
                },
              }
            : {}),
          ...(input.search?.trim()
            ? {
                name: {
                  contains: input.search.trim(),
                },
              }
            : {}),
          ...(input.position && input.position !== "ALL"
            ? {
                position: input.position,
              }
            : {}),
          ...(input.rookieEligibleOnly
            ? {
                yearsPro: ROOKIE_ELIGIBLE_YEARS_PRO,
              }
            : {}),
          ...(input.rostered === undefined
            ? {}
            : input.rostered
              ? {
                  OR: [
                    {
                      rosterSlots: {
                        some: {
                          seasonId: input.seasonId,
                        },
                      },
                    },
                    {
                      contracts: {
                        some: {
                          seasonId: input.seasonId,
                        },
                      },
                    },
                  ],
                }
              : {
                  AND: [
                    {
                      rosterSlots: {
                        none: {
                          seasonId: input.seasonId,
                        },
                      },
                    },
                    {
                      contracts: {
                        none: {
                          seasonId: input.seasonId,
                        },
                      },
                    },
                  ],
                }),
        },
        include: {
          rosterSlots: {
            where: {
              seasonId: input.seasonId,
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
            take: 1,
          },
          contracts: {
            where: {
              seasonId: input.seasonId,
              status: {
                in: ["ACTIVE", "EXPIRING", "TAGGED"],
              },
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
            },
            take: 1,
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      const mapped = players.map((player) => {
        const ranking =
          draftRankingLookup.get(
            fantasyProsDraftRankingLookupKey({
              name: player.name,
              nflTeam: player.nflTeam,
              position: player.position,
            }),
          ) ??
          (input.rookieEligibleOnly
            ? findMockRookieClassRanking({
                sourceKey: player.sourceKey,
                sourcePlayerId: player.sourcePlayerId,
                externalId: player.externalId,
                name: player.name,
                nflTeam: player.nflTeam,
                position: player.position,
              })
            : null);

        return {
          id: player.id,
          name: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          age: player.age,
          yearsPro: player.yearsPro,
          injuryStatus: player.injuryStatus,
          isRestricted: player.isRestricted,
          isRostered: player.rosterSlots.length > 0 || player.contracts.length > 0,
          draftRank: ranking?.overallRank ?? null,
          draftTier: ranking?.tier ?? null,
          positionRank: ranking?.positionRank ?? null,
          bestRank: ranking?.bestRank ?? null,
          worstRank: ranking?.worstRank ?? null,
          averageRank: ranking?.averageRank ?? null,
          standardDeviation: ranking?.standardDeviation ?? null,
          ecrVsAdp: ranking?.ecrVsAdp ?? null,
          ownerTeam: player.rosterSlots[0]?.team ?? player.contracts[0]?.team ?? null,
        };
      });

      const eligiblePlayers = mapped.filter(
        (player) => !input.rookieEligibleOnly || isRookieEligibleYearsPro(player.yearsPro),
      );
      const rankedPlayers = eligiblePlayers.filter((player) => player.draftRank !== null);
      const tierFilter = input.tier ?? "ALL";
      const filteredPlayers = rankedPlayers.filter((player) => {
        if (input.availableOnly && player.isRestricted) {
          return false;
        }

        if (tierFilter === "ALL") {
          return true;
        }

        if (tierFilter === "5_PLUS") {
          return (player.draftTier ?? Number.POSITIVE_INFINITY) >= 5;
        }

        return player.draftTier === Number.parseInt(tierFilter, 10);
      });
      const sortBy = input.sortBy ?? "rank";
      const sortDir = input.sortDir ?? "asc";

      return [...filteredPlayers].sort((left, right) => {
        const rankLeft = left.draftRank ?? Number.POSITIVE_INFINITY;
        const rankRight = right.draftRank ?? Number.POSITIVE_INFINITY;
        const tierLeft = left.draftTier ?? Number.POSITIVE_INFINITY;
        const tierRight = right.draftTier ?? Number.POSITIVE_INFINITY;
        const positionCompare = left.position.localeCompare(right.position);
        const nameCompare = left.name.localeCompare(right.name);
        const ageLeft = left.age ?? -1;
        const ageRight = right.age ?? -1;

        if (sortBy === "rank") {
          if (rankLeft !== rankRight) {
            return sortDir === "asc" ? rankLeft - rankRight : rankRight - rankLeft;
          }
          return sortDir === "asc" ? nameCompare : -nameCompare;
        }

        if (sortBy === "tier") {
          if (tierLeft !== tierRight) {
            return sortDir === "asc" ? tierLeft - tierRight : tierRight - tierLeft;
          }
          if (rankLeft !== rankRight) {
            return sortDir === "asc" ? rankLeft - rankRight : rankRight - rankLeft;
          }
          return sortDir === "asc" ? nameCompare : -nameCompare;
        }

        if (sortBy === "position") {
          if (positionCompare !== 0) {
            return sortDir === "asc" ? positionCompare : -positionCompare;
          }
          return sortDir === "asc" ? nameCompare : -nameCompare;
        }

        if (sortBy === "age") {
          if (ageLeft !== ageRight) {
            return sortDir === "asc" ? ageLeft - ageRight : ageRight - ageLeft;
          }
          return sortDir === "asc" ? nameCompare : -nameCompare;
        }

        return sortDir === "asc" ? nameCompare : -nameCompare;
      });
    },
  };
}
