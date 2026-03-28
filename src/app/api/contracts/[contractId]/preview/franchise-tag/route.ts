import { NextRequest, NextResponse } from "next/server";
import { requireContractLeagueRole } from "@/lib/authorization";
import {
  requireActorTeamScope,
} from "@/lib/auth";
import { apiError } from "@/lib/api";
import { createFranchiseTagImpactPreviewService } from "@/lib/domain/contracts/franchise-tag-impact-preview-service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { contractId } = await routeContext.params;
  const access = await requireContractLeagueRole(request, contractId, [
    "COMMISSIONER",
    "MEMBER",
  ]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const contract = await prisma.contract.findFirst({
    where: {
      id: contractId,
      seasonId: context.seasonId,
      team: {
        leagueId: context.leagueId,
      },
    },
    select: {
      teamId: true,
    },
  });

  if (!contract) {
    return apiError(404, "CONTRACT_NOT_FOUND", "Contract was not found in the active league.");
  }

  const teamScopeResponse = requireActorTeamScope(auth.actor, contract.teamId);
  if (teamScopeResponse) {
    return teamScopeResponse;
  }

  try {
    const preview = await createFranchiseTagImpactPreviewService(prisma).preview({
      contractId,
    });
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FRANCHISE_TAG_NOT_AVAILABLE";
    if (message === "CONTRACT_NOT_FOUND") {
      return apiError(404, "CONTRACT_NOT_FOUND", "Contract was not found in the active league.");
    }
    if (
      message === "FRANCHISE_TAG_ALREADY_USED" ||
      message === "FRANCHISE_TAG_CONSECUTIVE_NOT_ALLOWED" ||
      message === "ALREADY_TAGGED"
    ) {
      return apiError(409, "FRANCHISE_TAG_NOT_AVAILABLE", "Franchise tag is not available for this player.", {
        reason: message,
      });
    }
    if (
      message === "FRANCHISE_TAG_MARKET_DATA_UNAVAILABLE" ||
      message === "FRANCHISE_TAG_POSITION_UNSUPPORTED"
    ) {
      return apiError(409, "FRANCHISE_TAG_NOT_AVAILABLE", "Franchise tag salary could not be calculated.", {
        reason: message,
      });
    }
    if (message === "TEAM_VALIDATION_CONTEXT_NOT_FOUND") {
      return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
    }

    return apiError(409, "FRANCHISE_TAG_NOT_AVAILABLE", "Franchise tag is not available for this contract.");
  }
}
