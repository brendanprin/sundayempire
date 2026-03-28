import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireContractLeagueRole } from "@/lib/authorization";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { loadTeamValidationContext } from "@/lib/compliance/context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { resolveContractStatus } from "@/lib/domain/contracts/shared";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

function validateContractConstraints(
  salary: number,
  yearsTotal: number,
  ruleset: {
    minSalary: number;
    minContractYears: number;
    maxContractYears: number;
    maxContractYearsIfSalaryBelowTen: number;
  },
) {
  if (salary < ruleset.minSalary) {
    return `Salary must be at least ${ruleset.minSalary}.`;
  }

  if (yearsTotal < ruleset.minContractYears || yearsTotal > ruleset.maxContractYears) {
    return `Contract years must be between ${ruleset.minContractYears} and ${ruleset.maxContractYears}.`;
  }

  if (salary < 10 && yearsTotal > ruleset.maxContractYearsIfSalaryBelowTen) {
    return `Players with salary below $10 cannot exceed ${ruleset.maxContractYearsIfSalaryBelowTen} years.`;
  }

  return null;
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { contractId } = await routeContext.params;
  const access = await requireContractLeagueRole(request, contractId, ["COMMISSIONER"]);
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

  const body = (await request.json()) as {
    salary?: number;
    yearsTotal?: number;
    yearsRemaining?: number;
    isFranchiseTag?: boolean;
    reason?: string;
  };

  const salary = Number.isInteger(body.salary) ? Number(body.salary) : contract.salary;
  const yearsTotal = Number.isInteger(body.yearsTotal)
    ? Number(body.yearsTotal)
    : contract.yearsTotal;
  const yearsRemaining = Number.isInteger(body.yearsRemaining)
    ? Number(body.yearsRemaining)
    : Math.min(contract.yearsRemaining, yearsTotal);
  const isFranchiseTag =
    typeof body.isFranchiseTag === "boolean" ? body.isFranchiseTag : contract.isFranchiseTag;

  if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
    return apiError(400, "OVERRIDE_REASON_REQUIRED", "Contract updates require a written reason.");
  }

  if (typeof body.isFranchiseTag === "boolean" && body.isFranchiseTag !== contract.isFranchiseTag) {
    return apiError(
      409,
      "FRANCHISE_TAG_NOT_AVAILABLE",
      "Use the franchise tag action to change tag state.",
    );
  }

  const constraintError = validateContractConstraints(salary, yearsTotal, context.ruleset);
  if (constraintError) {
    return apiError(400, "CONTRACT_CONSTRAINT_VIOLATION", constraintError);
  }

  if (yearsRemaining < 0 || yearsRemaining > yearsTotal) {
    return apiError(
      400,
      "INVALID_YEARS_REMAINING",
      "yearsRemaining must be between 0 and yearsTotal.",
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
            salary,
            yearsTotal,
            yearsRemaining,
            isFranchiseTag,
          }
        : existingContract,
    ),
  });

  const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);
  if (introducedErrors.length > 0) {
    return apiError(
      409,
      "COMPLIANCE_VIOLATION",
      "Contract update would introduce new compliance errors.",
      {
        beforeStatus: beforeReport.status,
        afterStatus: afterReport.status,
        introducedFindings: introducedErrors,
      },
    );
  }

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: {
      salary,
      yearsTotal,
      yearsRemaining,
      endYear: contract.startYear + yearsTotal - 1,
      status: resolveContractStatus({
        status: contract.status,
        yearsRemaining,
        isFranchiseTag,
        endedAt: contract.endedAt,
      }),
    },
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

  await createContractLedgerService(prisma).syncContractLedger(updated.id);
  await createTeamSeasonStateRecalculationService(prisma).recalculateTeamSeasonState({
    teamId: contract.team.id,
    seasonId: context.seasonId,
  });
  await createComplianceIssueService(prisma).syncTeamComplianceState({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
  });
  await createCommissionerOverrideService(prisma).recordOverride({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    overrideType: "CONTRACT_UPDATE",
    reason: body.reason.trim(),
    entityType: "contract",
    entityId: contract.id,
    beforeJson: {
      salary: contract.salary,
      yearsTotal: contract.yearsTotal,
      yearsRemaining: contract.yearsRemaining,
      isFranchiseTag: contract.isFranchiseTag,
    },
    afterJson: {
      salary: updated.salary,
      yearsTotal: updated.yearsTotal,
      yearsRemaining: updated.yearsRemaining,
      isFranchiseTag: updated.isFranchiseTag,
    },
    notificationTitle: "Commissioner contract updated",
    notificationBody: body.reason.trim(),
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: contract.team.id,
    playerId: contract.player.id,
    type: TransactionType.CONTRACT_UPDATE,
    summary: `Updated contract for ${contract.player.name} on ${contract.team.name}.`,
    metadata: {
      contractId: contract.id,
      before: {
        salary: contract.salary,
        yearsTotal: contract.yearsTotal,
        yearsRemaining: contract.yearsRemaining,
        isFranchiseTag: contract.isFranchiseTag,
      },
      after: {
        salary: updated.salary,
        yearsTotal: updated.yearsTotal,
        yearsRemaining: updated.yearsRemaining,
        isFranchiseTag: updated.isFranchiseTag,
      },
      updatedBy: "api/contracts/[contractId] PATCH",
    },
  });

  return NextResponse.json({ contract: updated });
}
