import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { isActorTeamScopedMember, requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseIntegerParam } from "@/lib/request";
import { parseTransactionAuditMetadata } from "@/lib/transactions";

function isTransactionType(value: string): value is TransactionType {
  return (Object.values(TransactionType) as string[]).includes(value);
}

function readLegacyMetadataTradeId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>).tradeId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
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

  const params = request.nextUrl.searchParams;
  const rawLimit = parseIntegerParam(params.get("limit"));
  const limit = rawLimit ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const teamId = params.get("teamId");
  const actorEmail = params.get("actorEmail")?.trim().toLowerCase() ?? "";
  const proposalId = params.get("proposalId")?.trim() ?? "";
  const tradeId = params.get("tradeId")?.trim() ?? "";
  const tradeEntityId = proposalId || tradeId;
  const rawType = params.get("type");
  let typeFilter: TransactionType | null = null;

  if (rawType && rawType.length > 0) {
    if (!isTransactionType(rawType)) {
      return apiError(400, "INVALID_TRANSACTION_TYPE_FILTER", "type must be a valid transaction type.", {
        validTypes: Object.values(TransactionType),
      });
    }

    typeFilter = rawType;
  }

  if (
    auth.actor &&
    isActorTeamScopedMember(auth.actor) &&
    teamId &&
    teamId !== auth.actor.teamId
  ) {
    return apiError(
      403,
      "FORBIDDEN",
      "Members with team assignment can only view their own team transactions.",
    );
  }

  const scopedTeamId =
    auth.actor && isActorTeamScopedMember(auth.actor) ? auth.actor.teamId : teamId;

  if (scopedTeamId) {
    const team = await prisma.team.findFirst({
      where: {
        id: scopedTeamId,
        leagueId: context.leagueId,
      },
      select: { id: true },
    });

    if (!team) {
      return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
        teamId,
      });
    }
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      leagueId: context.leagueId,
      ...(scopedTeamId ? { teamId: scopedTeamId } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    include: {
      team: {
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
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit * 4, 200), 1000),
  });

  const filtered = transactions.filter((transaction) => {
    const audit = parseTransactionAuditMetadata(transaction.metadata);
    const actorEmailMatches =
      actorEmail.length === 0 || (audit?.actor?.email?.toLowerCase() ?? "") === actorEmail;

    if (!actorEmailMatches) {
      return false;
    }

    if (!tradeEntityId) {
      return true;
    }

    const auditTradeId =
      typeof audit?.entities?.tradeId === "string" ? audit.entities.tradeId : null;
    const auditTradeProposalId =
      typeof audit?.entities?.tradeProposalId === "string"
        ? audit.entities.tradeProposalId
        : null;
    const legacyTradeId = readLegacyMetadataTradeId(transaction.metadata);
    return (
      auditTradeProposalId === tradeEntityId ||
      auditTradeId === tradeEntityId ||
      legacyTradeId === tradeEntityId
    );
  });

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    filters: {
      teamId: scopedTeamId ?? null,
      limit,
      actorEmail: actorEmail || null,
      proposalId: proposalId || null,
      tradeId: tradeId || null,
      type: typeFilter,
    },
    transactions: filtered.slice(0, limit).map((transaction) => ({
      ...transaction,
      audit: parseTransactionAuditMetadata(transaction.metadata),
    })),
  });
}
