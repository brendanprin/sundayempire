import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import {
  assignLeagueCommissioner,
  CommissionerAssignmentError,
  getLeagueCommissionerIntegrity,
} from "@/lib/domain/league-membership/commissioner-assignment";
import { parseJsonBody } from "@/lib/request";
import { prisma } from "@/lib/prisma";
import { readLeagueCommissionerGovernanceSnapshot } from "@/lib/read-models/commissioner-governance/commissioner-governance-read-model";
import { logTransaction } from "@/lib/transactions";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }

  const snapshot = await readLeagueCommissionerGovernanceSnapshot(prisma, {
    leagueId: access.context.leagueId,
    includePendingCommissionerDesignation: true,
    historyLimit: 30,
  });

  return NextResponse.json({
    leagueId: access.context.leagueId,
    viewer: {
      userId: access.actor.userId,
      accountRole: access.actor.accountRole,
      canTransferCommissioner: access.actor.leagueRole === "COMMISSIONER",
      canRepairCommissionerIntegrity:
        access.actor.leagueRole === "COMMISSIONER" ||
        (access.actor.leagueRole === "MEMBER" &&
          snapshot.integrity.status === "MISSING_COMMISSIONER"),
    },
    integrity: snapshot.integrity,
    commissioner: snapshot.commissioner,
    members: snapshot.members,
    pendingCommissionerDesignation: snapshot.pendingCommissionerDesignation,
    history: snapshot.history,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const json = await parseJsonBody<{ targetUserId?: unknown }>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  if (typeof body.targetUserId !== "string" || body.targetUserId.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "targetUserId is required.");
  }

  const targetUserId = body.targetUserId.trim();
  if (targetUserId === access.actor.userId) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "The target user already holds commissioner authority.",
    );
  }

  const transferResult = await prisma.$transaction(async (tx) => {
    const integrityBeforeTransfer = await getLeagueCommissionerIntegrity(tx, {
      leagueId: access.context.leagueId,
      includePendingCommissionerDesignation: true,
    });

    if (integrityBeforeTransfer.status !== "HEALTHY") {
      return {
        error: apiError(
          409,
          "COMMISSIONER_INTEGRITY_STATE_INVALID",
          "Commissioner transfer is blocked until commissioner integrity is repaired.",
          {
            integrityStatus: integrityBeforeTransfer.status,
            integrityIssues: integrityBeforeTransfer.issues,
          },
        ),
      };
    }

    let assignment;
    try {
      assignment = await assignLeagueCommissioner(tx, {
        leagueId: access.context.leagueId,
        targetUserId,
        operation: "COMMISSIONER_TRANSFER",
        expectedCurrentCommissionerUserId: access.actor.userId,
        allowMissingCurrentCommissioner: false,
      });
    } catch (error) {
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

        if (
          error.code === "CURRENT_COMMISSIONER_REQUIRED" ||
          error.code === "EXPECTED_CURRENT_COMMISSIONER_MISMATCH"
        ) {
          return {
            error: apiError(
              403,
              "FORBIDDEN",
              "Only the current commissioner may transfer commissioner authority.",
            ),
          };
        }

        if (error.code === "COMMISSIONER_STATE_INVALID") {
          const integrityState = await getLeagueCommissionerIntegrity(tx, {
            leagueId: access.context.leagueId,
            includePendingCommissionerDesignation: true,
          });

          return {
            error: apiError(
              409,
              "COMMISSIONER_INTEGRITY_STATE_INVALID",
              "Commissioner transfer is blocked until commissioner integrity is repaired.",
              {
                integrityStatus: integrityState.status,
                integrityIssues: integrityState.issues,
              },
            ),
          };
        }

        return {
          error: apiError(
            409,
            "COMMISSIONER_CONTINUITY_CONFLICT",
            "Commissioner assignment could not be completed safely. Refresh and try again.",
          ),
        };
      }

      throw error;
    }

    await logTransaction(tx, {
      leagueId: access.context.leagueId,
      seasonId: access.context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Transferred commissioner authority to ${assignment.commissioner.user.email}.`,
      metadata: {
        updatedBy: "api/league/commissioner POST",
        transfer: {
          fromUserId: assignment.previousCommissioner?.userId ?? access.actor.userId,
          fromEmail: assignment.previousCommissioner?.user.email ?? access.actor.email,
          toUserId: assignment.commissioner.userId,
          toEmail: assignment.commissioner.user.email,
        },
      },
    });

    return {
      error: null,
      commissioner: {
        membershipId: assignment.commissioner.id,
        userId: assignment.commissioner.userId,
        email: assignment.commissioner.user.email,
        name: assignment.commissioner.user.name,
        leagueRole: assignment.commissioner.role,
        teamId: assignment.commissioner.teamId,
        teamName: assignment.commissioner.team?.name ?? null,
        createdAt: assignment.commissioner.createdAt.toISOString(),
      },
    };
  });

  if (transferResult.error) {
    return transferResult.error;
  }

  return NextResponse.json({
    leagueId: access.context.leagueId,
    commissioner: transferResult.commissioner,
    transferredAt: new Date().toISOString(),
  });
}
