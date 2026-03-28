import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { AuthActor } from "@/lib/auth";
import { logRuntime } from "@/lib/runtime-log";
import { PilotEventCategory, PilotEventType } from "@/types/pilot";

export type PilotEventDbClient = PrismaClient | Prisma.TransactionClient;

export type PilotEventInput = {
  leagueId: string;
  seasonId?: string | null;
  actor?: AuthActor | null;
  eventType: PilotEventType;
  eventCategory: PilotEventCategory;
  eventStep?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  pagePath?: string;
  requestPath?: string;
  requestMethod?: string;
  context?: Prisma.InputJsonValue;
};

export function requestTelemetry(request: NextRequest) {
  return {
    requestPath: request.nextUrl.pathname,
    requestMethod: request.method,
  };
}

export async function recordPilotEvent(db: PilotEventDbClient, input: PilotEventInput) {
  return db.pilotEvent.create({
    data: {
      leagueId: input.leagueId,
      seasonId: input.seasonId ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.leagueRole ?? null,
      actorTeamId: input.actor?.teamId ?? null,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      eventStep: input.eventStep ?? null,
      status: input.status ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      pagePath: input.pagePath ?? null,
      requestPath: input.requestPath ?? null,
      requestMethod: input.requestMethod ?? null,
      context: input.context ?? undefined,
      createdAt: new Date(),
    },
  });
}

export async function recordPilotEventSafe(db: PilotEventDbClient, input: PilotEventInput) {
  try {
    return await recordPilotEvent(db, input);
  } catch (error) {
    logRuntime("warn", {
      event: "pilot_event.write_failed",
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      leagueId: input.leagueId,
      seasonId: input.seasonId ?? null,
      actorEmail: input.actor?.email ?? null,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
