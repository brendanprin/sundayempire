import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireContractLeagueRole } from "@/lib/authorization";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { loadTeamValidationContext } from "@/lib/compliance/context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createRookieOptionService } from "@/lib/domain/contracts/rookie-option-service";
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

  if (!contract.rookieOptionEligible || contract.rookieOptionExercised) {
    return apiError(
      409,
      "ROOKIE_OPTION_NOT_AVAILABLE",
      "Rookie option is not available for this contract.",
    );
  }

  const yearsToAdd = context.ruleset.rookieOptionYears;
  let preview: Awaited<ReturnType<ReturnType<typeof createRookieOptionService>["previewOptionExercise"]>>;
  try {
    preview = await createRookieOptionService(prisma).previewOptionExercise({
      contractId: contract.id,
      yearsToAdd,
      maxContractYears: context.ruleset.maxContractYears,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ROOKIE_OPTION_NOT_AVAILABLE";
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
    return apiError(
      409,
      "ROOKIE_OPTION_NOT_AVAILABLE",
      "Rookie option is not available for this contract.",
    );
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
            yearsTotal: preview.nextYearsTotal,
            yearsRemaining: preview.nextYearsRemaining,
          }
        : existingContract,
    ),
  });

  const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);
  if (introducedErrors.length > 0) {
    return apiError(
      409,
      "COMPLIANCE_VIOLATION",
      "Exercising rookie option would introduce new compliance errors.",
      {
        beforeStatus: beforeReport.status,
        afterStatus: afterReport.status,
        introducedFindings: introducedErrors,
      },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await createRookieOptionService(tx).exerciseOption({
      contractId: contract.id,
      yearsToAdd,
      maxContractYears: context.ruleset.maxContractYears,
      decidedByUserId: auth.actor?.userId ?? null,
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
    type: TransactionType.CONTRACT_OPTION_EXERCISED,
    summary: `Exercised rookie option for ${contract.player.name} on ${contract.team.name}.`,
    metadata: {
      contractId: contract.id,
      yearsAdded: yearsToAdd,
      updatedBy: "api/contracts/[contractId]/exercise-option POST",
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
