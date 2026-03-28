import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ActivityRepositoriesDbClient,
  CreateActivityEventInput,
} from "@/lib/repositories/activity/types";

export const activityEventInclude = Prisma.validator<Prisma.ActivityEventInclude>()({
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
});

export type ActivityEventRecord = Prisma.ActivityEventGetPayload<{
  include: typeof activityEventInclude;
}>;

function persistableJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullableJson(
  value: unknown | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.DbNull : persistableJson(value);
}

export function createActivityEventRepository(
  client: ActivityRepositoriesDbClient = prisma,
) {
  return {
    create(input: CreateActivityEventInput) {
      return client.activityEvent.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actorUserId ?? null,
          teamId: input.teamId ?? null,
          relatedTeamId: input.relatedTeamId ?? null,
          playerId: input.playerId ?? null,
          eventType: input.eventType,
          title: input.title,
          body: input.body,
          sourceEntityType: input.sourceEntityType ?? null,
          sourceEntityId: input.sourceEntityId ?? null,
          dedupeKey: input.dedupeKey ?? null,
          payload: nullableJson(input.payload),
          occurredAt: input.occurredAt ?? new Date(),
        },
        include: activityEventInclude,
      });
    },

    findById(eventId: string) {
      return client.activityEvent.findUnique({
        where: {
          id: eventId,
        },
        include: activityEventInclude,
      });
    },

    findByDedupeKey(dedupeKey: string) {
      return client.activityEvent.findUnique({
        where: {
          dedupeKey,
        },
        include: activityEventInclude,
      });
    },
  };
}
