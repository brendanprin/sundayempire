import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { isPilotEventType } from "@/types/pilot";

type UiEventPostBody = {
  eventType?: unknown;
  eventStep?: unknown;
  status?: unknown;
  pagePath?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  context?: unknown;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAnonymousSafeAuthEvent(eventType: unknown) {
  return typeof eventType === "string" && eventType.startsWith("ui.auth.");
}

function acceptedButNotRecorded() {
  return NextResponse.json(
    {
      accepted: true,
      event: null,
    },
    { status: 202 },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as UiEventPostBody;
  if (!isPilotEventType(body.eventType) || !body.eventType.startsWith("ui.")) {
    return apiError(400, "INVALID_REQUEST", "eventType must be a supported UI event type.");
  }

  const pagePath = asTrimmedString(body.pagePath);
  if (!pagePath || !pagePath.startsWith("/")) {
    return apiError(400, "INVALID_REQUEST", "pagePath is required and must start with '/'.");
  }

  const allowAnonymousAuthEvent = isAnonymousSafeAuthEvent(body.eventType);
  const context = await getActiveLeagueContext();
  if (!context) {
    return allowAnonymousAuthEvent
      ? acceptedButNotRecorded()
      : apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return allowAnonymousAuthEvent ? acceptedButNotRecorded() : auth.response;
  }

  const eventStep = asTrimmedString(body.eventStep);
  const status = asTrimmedString(body.status);
  const entityType = asTrimmedString(body.entityType);
  const entityId = asTrimmedString(body.entityId);
  const eventContext: Prisma.InputJsonValue | undefined =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as Prisma.InputJsonValue)
      : undefined;

  const event = await recordPilotEventSafe(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: auth.actor,
    eventType: body.eventType,
    eventCategory: "ui",
    eventStep: eventStep ?? undefined,
    status: status ?? undefined,
    entityType: entityType ?? undefined,
    entityId: entityId ?? undefined,
    pagePath,
    ...requestTelemetry(request),
    context: eventContext,
  });

  return NextResponse.json(
    {
      event: event
        ? {
            id: event.id,
            eventType: event.eventType,
            eventCategory: event.eventCategory,
            createdAt: event.createdAt,
          }
        : null,
    },
    { status: 201 },
  );
}
