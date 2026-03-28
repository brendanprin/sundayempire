import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { isActorTeamScopedMember, requireLeagueRole } from "@/lib/auth";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { loadTeamValidationContext } from "@/lib/compliance/context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { ACTIVE_CONTRACT_STATUSES, resolveContractStatus } from "@/lib/domain/contracts/shared";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseBooleanParam } from "@/lib/request";
import { logRuntime, resolveRequestId } from "@/lib/runtime-log";
import { logTransaction } from "@/lib/transactions";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";

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
  const expiringOnly = parseBooleanParam(params.get("expiring")) ?? false;
  const rookieOptionEligible = parseBooleanParam(params.get("rookieOptionEligible")) ?? false;
  const taggedOnly = parseBooleanParam(params.get("tagged")) ?? false;
  const memberTeamId =
    auth.actor && isActorTeamScopedMember(auth.actor) ? auth.actor.teamId : null;

  const contracts = await prisma.contract.findMany({
    where: {
      seasonId: context.seasonId,
      status: {
        in: [...ACTIVE_CONTRACT_STATUSES],
      },
      ...(memberTeamId ? { teamId: memberTeamId } : {}),
      ...(expiringOnly ? { yearsRemaining: { lte: 1 } } : {}),
      ...(rookieOptionEligible ? { rookieOptionEligible: true } : {}),
      ...(taggedOnly ? { isFranchiseTag: true } : {}),
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
    orderBy: [{ yearsRemaining: "asc" }, { salary: "desc" }],
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
    contracts,
  });
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const auth = { actor: access.actor };
  logRuntime("info", {
    event: "contracts.create.request",
    requestId,
    actorEmail: auth.actor?.email ?? null,
    actorLeagueRole: auth.actor?.leagueRole ?? null,
    path: request.nextUrl.pathname,
    method: request.method,
  });

  const body = (await request.json()) as {
    teamId?: string;
    playerId?: string;
    salary?: number;
    yearsTotal?: number;
    isRookieContract?: boolean;
    reason?: string;
  };

  if (!body.teamId || !body.playerId) {
    return apiError(400, "INVALID_REQUEST", "teamId and playerId are required.");
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
    return apiError(400, "OVERRIDE_REASON_REQUIRED", "Contract creation requires a written reason.");
  }

  const salary = Number(body.salary);
  const yearsTotal = Number(body.yearsTotal);

  if (!Number.isInteger(salary) || !Number.isInteger(yearsTotal)) {
    return apiError(400, "INVALID_REQUEST", "salary and yearsTotal must be integers.");
  }

  const constraintError = validateContractConstraints(salary, yearsTotal, context.ruleset);
  if (constraintError) {
    return apiError(400, "CONTRACT_CONSTRAINT_VIOLATION", constraintError);
  }

  const [team, player, existingContract] = await Promise.all([
    prisma.team.findFirst({
      where: {
        id: body.teamId,
        leagueId: context.leagueId,
      },
    }),
    prisma.player.findUnique({
      where: {
        id: body.playerId,
      },
    }),
    prisma.contract.findFirst({
      where: {
        seasonId: context.seasonId,
        playerId: body.playerId,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
    }),
  ]);

  if (!team) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in this league.");
  }

  if (!player) {
    return apiError(404, "PLAYER_NOT_FOUND", "Player was not found.");
  }

  if (existingContract) {
    return apiError(
      409,
      "CONTRACT_EXISTS",
      "Player already has a contract for the active season.",
      { contractId: existingContract.id },
    );
  }

  const yearsRemaining = yearsTotal;
  const startYear = context.seasonYear;
  const endYear = startYear + yearsTotal - 1;
  const isRookieContract = Boolean(body.isRookieContract);
  const isFranchiseTag = false;
  const status = resolveContractStatus({
    yearsRemaining,
    isFranchiseTag,
    endedAt: null,
  });

  const validationContext = await loadTeamValidationContext({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: team.id,
  });

  if (!validationContext) {
    return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
  }

  const beforeReport = evaluateComplianceFromContext(validationContext);
  const afterReport = evaluateComplianceFromContext({
    ...validationContext,
    contracts: [
      ...validationContext.contracts,
      {
        id: `preview-contract-${player.id}`,
        salary,
        yearsTotal,
        yearsRemaining,
        isFranchiseTag,
        player: {
          id: player.id,
          name: player.name,
          position: player.position,
        },
      },
    ],
  });

  const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);
  if (introducedErrors.length > 0) {
    return apiError(
      409,
      "COMPLIANCE_VIOLATION",
      "Contract change would introduce new compliance errors.",
      {
        beforeStatus: beforeReport.status,
        afterStatus: afterReport.status,
        introducedFindings: introducedErrors,
      },
    );
  }

  const contract = await prisma.contract.create({
    data: {
      seasonId: context.seasonId,
      teamId: team.id,
      playerId: player.id,
      salary,
      yearsTotal,
      yearsRemaining,
      startYear,
      endYear,
      isRookieContract,
      rookieOptionEligible: isRookieContract,
      rookieOptionExercised: false,
      isFranchiseTag,
      status,
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

  await createContractLedgerService(prisma).syncContractLedger(contract.id);
  await createTeamSeasonStateRecalculationService(prisma).recalculateTeamSeasonState({
    teamId: team.id,
    seasonId: context.seasonId,
  });
  await createComplianceIssueService(prisma).syncTeamComplianceState({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: team.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
  });
  await createCommissionerOverrideService(prisma).recordOverride({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: team.id,
    actorUserId: auth.actor?.userId ?? null,
    actorRoleSnapshot: auth.actor?.leagueRole ?? null,
    overrideType: "CONTRACT_CREATE",
    reason: body.reason.trim(),
    entityType: "contract",
    entityId: contract.id,
    afterJson: {
      salary,
      yearsTotal,
      yearsRemaining,
      isRookieContract,
      teamId: team.id,
      playerId: player.id,
    },
    metadata: {
      requestId,
    },
    notificationTitle: "Commissioner contract created",
    notificationBody: body.reason.trim(),
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: team.id,
    playerId: player.id,
    type: TransactionType.CONTRACT_CREATE,
    summary: `Created ${yearsTotal}-year $${salary} contract for ${player.name}.`,
    metadata: {
      contractId: contract.id,
      salary,
      yearsTotal,
      createdBy: "api/contracts POST",
      requestId,
      actor: {
        email: auth.actor?.email ?? null,
        leagueRole: auth.actor?.leagueRole ?? null,
      },
    },
  });

  return NextResponse.json({ contract }, { status: 201 });
}
