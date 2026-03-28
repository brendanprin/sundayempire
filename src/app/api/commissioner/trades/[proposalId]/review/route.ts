import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireTradeProposalLeagueRole } from "@/lib/authorization";
import { createTradeProposalWorkflowService } from "@/lib/domain/trades/trade-proposal-service";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { createTradeProposalDetailProjection } from "@/lib/read-models/trades/trade-proposal-detail-projection";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type RouteContext = {
  params: Promise<{
    proposalId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { proposalId } = await routeContext.params;
  const access = await requireTradeProposalLeagueRole(request, proposalId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const season = await prisma.season.findUnique({
    where: { id: context.seasonId },
    select: { phase: true },
  });
  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  const body = (await request.json().catch(() => null)) as {
    decision?: unknown;
    reason?: unknown;
  } | null;
  const decision =
    body?.decision === "approve" || body?.decision === "reject" ? body.decision : null;
  const reason = typeof body?.reason === "string" ? body.reason : "";

  if (!decision) {
    return apiError(400, "INVALID_REQUEST", "decision must be approve or reject.");
  }

  try {
    const result = await createTradeProposalWorkflowService(prisma).review({
      actor: auth.actor,
      proposalId,
      decision,
      reason,
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType:
        decision === "approve"
          ? PILOT_EVENT_TYPES.TRADE_ACCEPTED
          : PILOT_EVENT_TYPES.TRADE_REJECTED,
      eventCategory: "trade",
      eventStep: "review",
      status: "success",
      entityType: "trade_proposal",
      entityId: result.proposalId,
      ...requestTelemetry(request),
      context: {
        proposalId: result.proposalId,
        decision,
        nextStatus: result.status,
      },
    });

    const detail = await createTradeProposalDetailProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
      seasonPhase: season.phase,
      leagueName: context.leagueName,
      actor: auth.actor,
      proposalId: result.proposalId,
    });

    if (!detail) {
      return apiError(404, "TRADE_NOT_FOUND", "Trade proposal could not be reloaded.");
    }

    return NextResponse.json(detail);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    if (code === "OVERRIDE_REASON_REQUIRED") {
      return apiError(400, code, "Commissioner review requires a written reason.");
    }
    if (code === "TRADE_STATE_CONFLICT") {
      return apiError(409, code, "Only review-pending proposals can be reviewed.");
    }
    if (code === "TRADE_NOT_FOUND") {
      return apiError(404, code, "Trade proposal was not found.");
    }
    return apiError(400, "INVALID_REQUEST", "Commissioner review was invalid.");
  }
}
