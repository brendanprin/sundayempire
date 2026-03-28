import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireContractLeagueRole } from "@/lib/authorization";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { loadTeamValidationContext } from "@/lib/compliance/context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createFranchiseTagUsageService } from "@/lib/domain/contracts/franchise-tag-usage-service";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

export async function POST(_request: NextRequest, routeContext: RouteContext) {
  const { contractId } = await routeContext.params;
  const access = await requireContractLeagueRole(_request, contractId, ["COMMISSIONER"]);
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
    include: {
      player: {
        select: { id: true, name: true },
      },
      team: {
        select: { id: true, name: true },
      },
    },
  });

  if (!contract) {
    return apiError(404, "CONTRACT_NOT_FOUND", "Contract was not found in the active league.");
  }

  if (contract.isFranchiseTag) {
    return apiError(409, "ALREADY_TAGGED", "Contract is already franchise tagged.");
  }

  let preview: Awaited<ReturnType<ReturnType<typeof createFranchiseTagUsageService>["previewFranchiseTag"]>>;
  try {
    preview = await createFranchiseTagUsageService(prisma).previewFranchiseTag({
      contractId: contract.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FRANCHISE_TAG_NOT_AVAILABLE";
    if (message === "FRANCHISE_TAG_ALREADY_USED" || message === "FRANCHISE_TAG_CONSECUTIVE_NOT_ALLOWED") {
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
    if (message === "CONTRACT_NOT_FOUND") {
      return apiError(404, "CONTRACT_NOT_FOUND", "Contract was not found in the active league.");
    }
    return apiError(409, "FRANCHISE_TAG_NOT_AVAILABLE", "Franchise tag is not available for this contract.");
  }

  const validationContext = await loadTeamValidationContext({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
  });
  if (!validationContext) {
    return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
  }

  const beforeReport = evaluateComplianceFromContext(validationContext);
  const afterReport = evaluateComplianceFromContext({
    ...validationContext,
    contracts: validationContext.contracts.map((existingContract) =>
      existingContract.id === contract.id
        ? {
            ...existingContract,
            salary: preview.finalTagSalary,
            yearsTotal: 1,
            yearsRemaining: 1,
            isFranchiseTag: true,
          }
        : existingContract,
    ),
  });

  const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);
  if (introducedErrors.length > 0) {
    return apiError(
      409,
      "COMPLIANCE_VIOLATION",
      "Applying franchise tag would introduce new compliance errors.",
      {
        beforeStatus: beforeReport.status,
        afterStatus: afterReport.status,
        introducedFindings: introducedErrors,
      },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await createFranchiseTagUsageService(tx).applyFranchiseTag({
      contractId: contract.id,
      createdByUserId: auth.actor?.userId ?? null,
    });
    await createTeamSeasonStateRecalculationService(tx).recalculateTeamSeasonState({
      teamId: contract.team.id,
      seasonId: context.seasonId,
    });

    return tx.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            nflTeam: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        },
      },
    });
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
    playerId: contract.player.id,
    type: TransactionType.FRANCHISE_TAG_APPLIED,
    summary: `Applied franchise tag to ${contract.player.name} on ${contract.team.name}.`,
    metadata: {
      contractId: contract.id,
      finalTagSalary: preview.finalTagSalary,
      priorSalary: preview.priorSalary,
      updatedBy: "api/contracts/[contractId]/franchise-tag POST",
    },
  });

  await createComplianceIssueService(prisma).syncTeamComplianceState({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
  });

  return NextResponse.json({ contract: updated });
}
