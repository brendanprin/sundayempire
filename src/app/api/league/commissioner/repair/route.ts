import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import {
  HEADER_LEAGUE_ID,
  getAuthActorForLeague,
  getAuthenticatedUser,
} from "@/lib/auth";
import { parseJsonBody } from "@/lib/request";
import { getActiveLeagueCookie } from "@/lib/auth/active-league";
import {
  CommissionerAssignmentError,
  CommissionerIntegrityRepairError,
  getLeagueCommissionerIntegrity,
  repairLeagueCommissionerIntegrity,
} from "@/lib/domain/league-membership/commissioner-assignment";
import {
  toCommissionerIntegrityRow,
  toCommissionerMembershipRow,
  toPendingCommissionerDesignationRow,
} from "@/lib/domain/league-membership/commissioner-governance-serialization";
import { getLeagueContextById, listAccessibleLeagueContextsForUser } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

function requestedLeagueIdFromRequest(request: NextRequest) {
  return request.headers.get(HEADER_LEAGUE_ID)?.trim() || getActiveLeagueCookie(request);
}

type RepairScopeResolution =
  | {
      error: NextResponse;
      context: null;
      actor: null;
    }
  | {
      error: null;
      context: {
        leagueId: string;
        seasonId: string;
      };
      actor: {
        userId: string;
        email: string;
        leagueRole: "COMMISSIONER" | "MEMBER";
      } | null;
    };

async function resolveRepairScope(input: {
  request: NextRequest;
  userId: string;
  userPlatformRole: "ADMIN" | "USER";
  explicitLeagueId?: string | null;
}): Promise<RepairScopeResolution> {
  const requestedLeagueId = input.explicitLeagueId || requestedLeagueIdFromRequest(input.request);
  const accessibleContexts = await listAccessibleLeagueContextsForUser(input.userId);

  if (!requestedLeagueId && accessibleContexts.length === 0) {
    if (input.userPlatformRole === "ADMIN") {
      return {
        error: apiError(
          400,
          "LEAGUE_SELECTION_REQUIRED",
          "leagueId is required for platform-admin commissioner repair requests.",
        ),
        context: null,
        actor: null,
      };
    }

    return {
      error: apiError(
        403,
        "FORBIDDEN",
        "You do not have membership access to any league workspace.",
      ),
      context: null,
      actor: null,
    };
  }

  const selectedLeagueId = requestedLeagueId ?? accessibleContexts[0]?.leagueId ?? null;
  if (!selectedLeagueId) {
    return {
      error: apiError(400, "LEAGUE_SELECTION_REQUIRED", "leagueId is required for this request."),
      context: null,
      actor: null,
    };
  }

  const accessibleContext =
    accessibleContexts.find((context) => context.leagueId === selectedLeagueId) ?? null;
  const context =
    accessibleContext ??
    (input.userPlatformRole === "ADMIN" ? await getLeagueContextById(selectedLeagueId) : null);

  if (!context) {
    return {
      error:
        input.userPlatformRole === "ADMIN"
          ? apiError(404, "LEAGUE_NOT_FOUND", "Requested league was not found.")
          : apiError(
              403,
              "FORBIDDEN",
              "You do not have membership access to the requested league workspace.",
            ),
      context: null,
      actor: null,
    };
  }

  const actor = await getAuthActorForLeague(input.request, context.leagueId);
  return {
    error: null,
    context: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
    },
    actor: actor
      ? {
          userId: actor.userId,
          email: actor.email,
          leagueRole: actor.leagueRole,
        }
      : null,
  };
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const json = await parseJsonBody<{ targetUserId?: unknown; leagueId?: unknown }>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  if (typeof body.targetUserId !== "string" || body.targetUserId.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "targetUserId is required.");
  }

  const explicitLeagueId =
    typeof body.leagueId === "string" && body.leagueId.trim().length > 0
      ? body.leagueId.trim()
      : null;

  const scope = await resolveRepairScope({
    request,
    userId: user.id,
    userPlatformRole: user.platformRole,
    explicitLeagueId,
  });
  if (scope.error || !scope.context) {
    return scope.error;
  }

  const targetUserId = body.targetUserId.trim();
  const repairResult = await prisma.$transaction(async (tx) => {
    const integrityBeforeRepair = await getLeagueCommissionerIntegrity(tx, {
      leagueId: scope.context.leagueId,
      includePendingCommissionerDesignation: true,
    });

    const canRepairAsPlatformAdmin = user.platformRole === "ADMIN";
    const canRepairAsCommissioner = scope.actor?.leagueRole === "COMMISSIONER";
    const canRepairMissingAsMember =
      scope.actor?.leagueRole === "MEMBER" &&
      integrityBeforeRepair.status === "MISSING_COMMISSIONER" &&
      scope.actor.userId === targetUserId;

    if (!canRepairAsPlatformAdmin && !canRepairAsCommissioner && !canRepairMissingAsMember) {
      return {
        error: apiError(
          403,
          "COMMISSIONER_REPAIR_FORBIDDEN",
          "You do not have permission to repair commissioner integrity for this league.",
          {
            integrityStatus: integrityBeforeRepair.status,
            requires:
              integrityBeforeRepair.status === "MISSING_COMMISSIONER"
                ? "platform admin, active commissioner, or self-recovery by an active member"
                : "platform admin or active commissioner",
          },
        ),
      };
    }

    let repaired;
    try {
      repaired = await repairLeagueCommissionerIntegrity(tx, {
        leagueId: scope.context.leagueId,
        targetUserId,
      });
    } catch (error) {
      if (error instanceof CommissionerIntegrityRepairError) {
        if (error.code === "INTEGRITY_ALREADY_HEALTHY") {
          return {
            error: apiError(
              409,
              "COMMISSIONER_INTEGRITY_ALREADY_HEALTHY",
              "Commissioner integrity is already healthy for this league.",
            ),
          };
        }

        return {
          error: apiError(
            409,
            "COMMISSIONER_INTEGRITY_REPAIR_FAILED",
            "Commissioner integrity repair did not complete safely.",
          ),
        };
      }

      if (error instanceof CommissionerAssignmentError) {
        if (error.code === "TARGET_MEMBERSHIP_NOT_FOUND") {
          return {
            error: apiError(
              404,
              "TARGET_MEMBER_NOT_FOUND",
              "Target user does not have league membership access.",
            ),
          };
        }

        return {
          error: apiError(
            409,
            "COMMISSIONER_CONTINUITY_CONFLICT",
            "Commissioner integrity repair could not be completed safely.",
          ),
        };
      }

      throw error;
    }

    await logTransaction(tx, {
      leagueId: scope.context.leagueId,
      seasonId: scope.context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Repaired commissioner integrity and assigned commissioner authority to ${repaired.assignment.commissioner.user.email}.`,
      metadata: {
        updatedBy: "api/league/commissioner/repair POST",
        repair: {
          repairedBy: {
            userId: user.id,
            email: user.email,
            accountRole: user.platformRole,
            leagueRole: scope.actor?.leagueRole ?? null,
          },
          targetUserId: repaired.assignment.commissioner.userId,
          targetEmail: repaired.assignment.commissioner.user.email,
          beforeStatus: repaired.beforeIntegrity.status,
          beforeIssueCodes: repaired.beforeIntegrity.issues.map((issue) => issue.code),
          beforeActiveCommissionerCount: repaired.beforeIntegrity.activeCommissioners.length,
          afterStatus: repaired.afterIntegrity.status,
          afterIssueCodes: repaired.afterIntegrity.issues.map((issue) => issue.code),
          afterActiveCommissionerCount: repaired.afterIntegrity.activeCommissioners.length,
        },
      },
    });

    return {
      error: null,
      repaired,
    };
  });

  if (repairResult.error || !repairResult.repaired) {
    return repairResult.error;
  }

  return NextResponse.json({
    leagueId: scope.context.leagueId,
    commissioner: toCommissionerMembershipRow(repairResult.repaired.assignment.commissioner),
    integrity: {
      before: {
        ...toCommissionerIntegrityRow(repairResult.repaired.beforeIntegrity),
        pendingCommissionerDesignation: toPendingCommissionerDesignationRow(
          repairResult.repaired.beforeIntegrity.pendingCommissionerDesignation,
        ),
      },
      after: {
        ...toCommissionerIntegrityRow(repairResult.repaired.afterIntegrity),
        pendingCommissionerDesignation: toPendingCommissionerDesignationRow(
          repairResult.repaired.afterIntegrity.pendingCommissionerDesignation,
        ),
      },
    },
    repairedAt: new Date().toISOString(),
  });
}
