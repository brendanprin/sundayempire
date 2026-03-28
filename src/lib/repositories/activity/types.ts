import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ActivityEventPayload,
  ActivityEventType,
} from "@/lib/domain/activity/event-types";

export type ActivityRepositoriesDbClient = PrismaClient | Prisma.TransactionClient;

export type CreateActivityEventInput<
  TEventType extends ActivityEventType = ActivityEventType,
> = {
  leagueId: string;
  seasonId: string;
  actorUserId?: string | null;
  teamId?: string | null;
  relatedTeamId?: string | null;
  playerId?: string | null;
  eventType: TEventType;
  title: string;
  body: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  dedupeKey?: string | null;
  payload?: ActivityEventPayload<TEventType> | null;
  occurredAt?: Date | null;
};

export type UpdateActivityEventInput = never;

export type ActivityEventJsonInput = Prisma.InputJsonValue;
