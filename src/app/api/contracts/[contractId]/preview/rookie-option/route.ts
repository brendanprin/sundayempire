import { NextRequest, NextResponse } from "next/server";
import { requireContractLeagueRole } from "@/lib/authorization";
import {
  requireActorTeamScope,
} from "@/lib/auth";
import { apiError } from "@/lib/api";
import { createRookieOptionImpactPreviewService } from "@/lib/domain/contracts/rookie-option-impact-preview-service";
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
    const preview = await createRookieOptionImpactPreviewService(prisma).preview({
      contractId,
      yearsToAdd: context.ruleset.rookieOptionYears,
      maxContractYears: context.ruleset.maxContractYears,
    });
    return NextResponse.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ROOKIE_OPTION_NOT_AVAILABLE";
    if (message === "CONTRACT_NOT_FOUND") {
      return apiError(404, "CONTRACT_NOT_FOUND", "Contract was not found in the active league.");
    }
    if (message === "CONTRACT_CONSTRAINT_VIOLATION") {
      return apiError(
        409,
        "CONTRACT_CONSTRAINT_VIOLATION",
        "Rookie option would exceed max contract years for active ruleset.",
        {
          maxContractYears: context.ruleset.maxContractYears,
        },
      );
    }
    if (message === "TEAM_VALIDATION_CONTEXT_NOT_FOUND") {
      return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
    }

    return apiError(
      409,
      "ROOKIE_OPTION_NOT_AVAILABLE",
      "Rookie option is not available for this contract.",
    );
  }
}
