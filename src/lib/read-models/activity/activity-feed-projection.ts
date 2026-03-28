import { prisma } from "@/lib/prisma";
import {
  resolveLeagueSeasonContext,
  type DashboardProjectionDbClient,
} from "@/lib/read-models/dashboard/shared";
import type {
  ActivityFeedFamily,
  ActivityFeedItem,
  ActivityFeedProjection,
} from "@/lib/read-models/activity/types";

function toEventFamily(eventType: string): ActivityFeedFamily {
  if (eventType.startsWith("lifecycle.")) return "lifecycle";
  if (eventType.startsWith("compliance.")) return "compliance";
  if (eventType.startsWith("commissioner.")) return "commissioner";
  if (eventType.startsWith("trade.")) return "trade";
  if (eventType.startsWith("draft.")) return "draft";
  if (eventType.startsWith("auction.")) return "auction";
  if (eventType.startsWith("sync.")) return "sync";
  return "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createActivityFeedProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      seasonId?: string | null;
      teamId?: string | null;
      type?: string | null;
      category?: string | null;
      limit?: number;
      cursor?: string | null;
    }): Promise<ActivityFeedProjection | null> {
      const context = await resolveLeagueSeasonContext(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId ?? undefined,
      });

      if (!context?.league) {
        return null;
      }

      const categoryPrefix =
        input.category && input.category !== "all" ? `${input.category}.` : null;
      const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
      const teamFilter = input.teamId?.trim() || null;
      const typeFilter = input.type?.trim() || null;
      const cursor = input.cursor?.trim() || null;
      const seasonId = context.season?.id ?? input.seasonId ?? null;

      const where = {
        leagueId: input.leagueId,
        ...(seasonId ? { seasonId } : {}),
        ...(teamFilter
          ? {
              OR: [{ teamId: teamFilter }, { relatedTeamId: teamFilter }],
            }
          : {}),
        ...(typeFilter
          ? { eventType: typeFilter }
          : categoryPrefix
            ? {
                eventType: {
                  startsWith: categoryPrefix,
                },
              }
            : {}),
      };

      const [events, total, groupedByType, seasons, teams] = await Promise.all([
        client.activityEvent.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          ...(cursor
            ? {
                cursor: {
                  id: cursor,
                },
                skip: 1,
              }
            : {}),
          include: {
            actorUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            relatedTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                nflTeam: true,
              },
            },
          },
        }),
        client.activityEvent.count({ where }),
        client.activityEvent.groupBy({
          by: ["eventType"],
          where,
          _count: {
            _all: true,
          },
        }),
        client.season.findMany({
          where: {
            leagueId: input.leagueId,
          },
          orderBy: [{ year: "desc" }],
          select: {
            id: true,
            year: true,
            status: true,
            phase: true,
          },
        }),
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        }),
      ]);

      const pageItems = events.slice(0, limit);
      const nextCursor = events.length > limit ? events[limit]?.id ?? null : null;

      const byType = Object.fromEntries(
        groupedByType.map((row) => [row.eventType, row._count._all]),
      );
      const byFamily = Object.entries(byType).reduce<Record<string, number>>((acc, [eventType, count]) => {
        const family = toEventFamily(eventType);
        acc[family] = (acc[family] ?? 0) + count;
        return acc;
      }, {});

      const feed: ActivityFeedItem[] = pageItems.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        eventFamily: toEventFamily(event.eventType),
        title: event.title,
        body: event.body,
        description: event.body,
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
        actorUser: event.actorUser,
        team: event.team,
        relatedTeam: event.relatedTeam,
        player: event.player,
        sourceEntityType: event.sourceEntityType,
        sourceEntityId: event.sourceEntityId,
        payload: isRecord(event.payload) ? event.payload : null,
        context: isRecord(event.payload) ? event.payload : null,
      }));

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        season: {
          id: context.season?.id ?? null,
          year: context.season?.year ?? null,
        },
        visibility: "league",
        filters: {
          seasonId,
          teamId: teamFilter,
          type: typeFilter,
          category: input.category?.trim() || null,
          limit,
          cursor,
        },
        summary: {
          total,
          byFamily,
          byCategory: byFamily,
          byType,
        },
        seasons: seasons.map((season) => ({
          id: season.id,
          year: season.year,
          status: season.status,
          phase: season.phase,
        })),
        teams,
        types: Object.keys(byType).sort(),
        page: {
          nextCursor,
        },
        feed,
      };
    },
  };
}
