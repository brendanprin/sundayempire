import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";
import {
  isPilotFeedbackCategory,
  isPilotFeedbackSeverity,
  PILOT_EVENT_TYPES,
} from "@/types/pilot";

type FeedbackPostBody = {
  category?: unknown;
  severity?: unknown;
  message?: unknown;
  stepsToReproduce?: unknown;
  pagePath?: unknown;
  pageTitle?: unknown;
  metadata?: unknown;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const requestedLimit = parseIntegerParam(request.nextUrl.searchParams.get("limit"));
  if (requestedLimit !== undefined && requestedLimit < 1) {
    return apiError(400, "INVALID_REQUEST", "limit must be a positive integer.");
  }
  const limit = Math.min(requestedLimit ?? 20, 100);
  const commissionerView = auth.actor?.leagueRole === "COMMISSIONER";

  const where = {
    leagueId: context.leagueId,
    ...(commissionerView ? {} : { actorEmail: auth.actor?.email ?? "" }),
  };

  const [feedback, byStatus, byCategory] = await Promise.all([
    prisma.pilotFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        actorEmail: true,
        actorRole: true,
        actorTeamId: true,
        category: true,
        severity: true,
        pagePath: true,
        pageTitle: true,
        message: true,
        stepsToReproduce: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.pilotFeedback.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.pilotFeedback.groupBy({
      by: ["category"],
      where,
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    visibility: commissionerView ? "league" : "self",
    feedback,
    summary: {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      byCategory: Object.fromEntries(byCategory.map((row) => [row.category, row._count._all])),
    },
  });
}

export async function POST(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as FeedbackPostBody;
  if (!isPilotFeedbackCategory(body.category)) {
    return apiError(400, "INVALID_REQUEST", "category must be a valid feedback category.");
  }
  if (!isPilotFeedbackSeverity(body.severity)) {
    return apiError(400, "INVALID_REQUEST", "severity must be LOW, MEDIUM, or HIGH.");
  }

  const message = asTrimmedString(body.message);
  if (!message || message.length < 10) {
    return apiError(400, "INVALID_REQUEST", "message is required and must be at least 10 characters.");
  }

  const pagePath = asTrimmedString(body.pagePath);
  if (!pagePath || !pagePath.startsWith("/")) {
    return apiError(400, "INVALID_REQUEST", "pagePath is required and must start with '/'.");
  }

  const stepsToReproduce = asTrimmedString(body.stepsToReproduce);
  const pageTitle = asTrimmedString(body.pageTitle);
  const metadata: Prisma.InputJsonValue | undefined =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Prisma.InputJsonValue)
      : undefined;

  const feedback = await prisma.pilotFeedback.create({
    data: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorEmail: auth.actor?.email ?? null,
      actorRole: auth.actor?.leagueRole ?? null,
      actorTeamId: auth.actor?.teamId ?? null,
      category: body.category,
      severity: body.severity,
      message,
      stepsToReproduce,
      pagePath,
      pageTitle,
      status: "NEW",
      metadata,
    },
    select: {
      id: true,
      category: true,
      severity: true,
      pagePath: true,
      status: true,
      createdAt: true,
    },
  });

  await recordPilotEventSafe(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: auth.actor,
    eventType: PILOT_EVENT_TYPES.PILOT_FEEDBACK_SUBMITTED,
    eventCategory: "feedback",
    eventStep: "submit",
    status: "success",
    entityType: "pilot_feedback",
    entityId: feedback.id,
    pagePath,
    ...requestTelemetry(request),
    context: {
      category: feedback.category,
      severity: feedback.severity,
    },
  });

  return NextResponse.json({ feedback }, { status: 201 });
}
