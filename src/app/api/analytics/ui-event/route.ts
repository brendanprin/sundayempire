import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { parseJsonBody } from "@/lib/request";
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
  const json = await parseJsonBody<UiEventPostBody>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  if (!isPilotEventType(body.eventType) || !body.eventType.startsWith("ui.")) {
    return apiError(400, "INVALID_REQUEST", "eventType must be a supported UI event type.");
  }

  const pagePath = asTrimmedString(body.pagePath);
  if (!pagePath || !pagePath.startsWith("/")) {
    return apiError(400, "INVALID_REQUEST", "pagePath is required and must start with '/'.");
  }

  const allowAnonymousAuthEvent = isAnonymousSafeAuthEvent(body.eventType);
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return allowAnonymousAuthEvent ? acceptedButNotRecorded() : access.response;
  }
  const { actor, context } = access;

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
    actor,
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
