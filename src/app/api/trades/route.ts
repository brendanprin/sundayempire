import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isActorTeamScopedMember } from "@/lib/auth";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";
import { parseJsonBody } from "@/lib/request";
import { analyzeTradeProposal, parseTradeRequest, toTradeSummary, tradeInclude } from "@/lib/trades";
import { PILOT_EVENT_TYPES } from "@/types/pilot";
import {
  CreateTradeRequest,
  CreateTradeResponse,
  isTradeStatus,
  TRADE_STATUS_VALUES,
  TradesListResponse,
} from "@/types/trade";

// Legacy compatibility route for pre-Sprint 7 trade flows.
export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const statusParam = request.nextUrl.searchParams.get("status");
  if (statusParam !== null && !isTradeStatus(statusParam)) {
    return apiError(400, "INVALID_TRADE_STATUS_FILTER", "status must be a valid trade status.", {
      validStatuses: TRADE_STATUS_VALUES,
    });
  }

  const trades = await prisma.trade.findMany({
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      ...(actor && isActorTeamScopedMember(actor)
        ? {
            OR: [{ teamAId: actor.teamId! }, { teamBId: actor.teamId! }],
          }
        : {}),
      ...(statusParam ? { status: statusParam } : {}),
    },
    include: tradeInclude,
    orderBy: [{ proposedAt: "desc" }, { createdAt: "desc" }],
  });

  const response: TradesListResponse = {
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    filter: {
      status: statusParam,
    },
    trades: trades.map((trade) => toTradeSummary(trade)),
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };

  const season = await prisma.season.findUnique({
    where: {
      id: context.seasonId,
    },
    select: {
      phase: true,
    },
  });

  if (!season) {
    return apiError(404, "SEASON_NOT_FOUND", "Active season was not found.");
  }

  const json = await parseJsonBody<CreateTradeRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const parsed = parseTradeRequest(body);

  if (!parsed.request) {
    return apiError(400, "INVALID_TRADE_REQUEST", "Trade request payload is invalid.", {
      findings: parsed.findings,
    });
  }
  const parsedRequest = parsed.request;
  if (auth.actor?.leagueRole === "MEMBER") {
    if (!auth.actor.teamId) {
      return apiError(
        403,
        "FORBIDDEN",
        "Member account is not assigned to a team for trade mutations.",
      );
    }

    if (
      parsedRequest.teamAId !== auth.actor.teamId &&
      parsedRequest.teamBId !== auth.actor.teamId
    ) {
      return apiError(
        403,
        "FORBIDDEN",
        "Members can only create trades involving their assigned team.",
      );
    }
  }

  const analysis = await analyzeTradeProposal(
    {
      league: context,
      seasonPhase: season.phase,
    },
    parsedRequest,
  );

  if (!analysis.legal) {
    return apiError(409, "TRADE_NOT_LEGAL", "Trade proposal failed legality checks.", {
      findings: analysis.findings,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        teamAId: parsedRequest.teamAId,
        teamBId: parsedRequest.teamBId,
        status: "PROPOSED",
        notes: parsedRequest.notes,
      },
    });

    if (analysis.assets.length > 0) {
      await tx.tradeAsset.createMany({
        data: analysis.assets.map((asset) => ({
          tradeId: trade.id,
          fromTeamId: asset.fromTeamId,
          toTeamId: asset.toTeamId,
          assetType: asset.assetType,
          playerId: asset.playerId,
          futurePickId: asset.futurePickId,
        })),
      });
    }

    const hydratedTrade = await tx.trade.findUnique({
      where: { id: trade.id },
      include: tradeInclude,
    });

    if (!hydratedTrade) {
      throw new Error("Created trade could not be reloaded.");
    }

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Created trade proposal between ${hydratedTrade.teamA.name} and ${hydratedTrade.teamB.name}.`,
      audit: {
        actor: auditActorFromRequestActor(auth.actor ?? null),
        source: "api/trades POST",
        entities: {
          tradeId: hydratedTrade.id,
          teamAId: hydratedTrade.teamA.id,
          teamBId: hydratedTrade.teamB.id,
          assetCount: hydratedTrade.assets.length,
        },
        before: {
          status: null,
        },
        after: {
          status: hydratedTrade.status,
        },
      },
      metadata: {
        notesPresent: Boolean(hydratedTrade.notes),
      },
    });

    await recordPilotEventSafe(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.TRADE_PROPOSAL_CREATED,
      eventCategory: "trade",
      eventStep: "proposal",
      status: "success",
      entityType: "trade",
      entityId: hydratedTrade.id,
      ...requestTelemetry(request),
      context: {
        teamAId: hydratedTrade.teamA.id,
        teamBId: hydratedTrade.teamB.id,
        assetCount: hydratedTrade.assets.length,
        notesPresent: Boolean(hydratedTrade.notes),
      },
    });

    return hydratedTrade;
  });

  const response: CreateTradeResponse = {
    trade: toTradeSummary(created),
    analysis: {
      legal: analysis.legal,
      findings: analysis.findings,
    },
  };

  return NextResponse.json(response, { status: 201 });
}
