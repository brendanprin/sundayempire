import { LeagueRole } from "@prisma/client";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import {
  CommissionerIntegrityIssue,
  CommissionerIntegrityStatus,
  CommissionerMembershipSnapshot,
  LeagueCommissionerIntegritySnapshot,
  PendingCommissionerDesignationConflictCode,
} from "./commissioner-assignment";

type MembershipLike = {
  id: string;
  userId: string;
  role: LeagueRole;
  teamId: string | null;
  createdAt: Date;
  user: {
    email: string;
    name: string | null;
  };
  team: {
    name: string;
  } | null;
};

export type CommissionerMembershipRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
};

export type PendingCommissionerDesignationRow = {
  inviteId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  invitedBy: {
    userId: string;
    email: string;
    name: string | null;
  } | null;
  targetMembership: {
    membershipId: string;
    userId: string;
    email: string;
    leagueRole: "COMMISSIONER" | "MEMBER";
  } | null;
  conflict: {
    code: PendingCommissionerDesignationConflictCode;
    message: string;
  } | null;
};

export type CommissionerIntegrityRow = {
  status: CommissionerIntegrityStatus;
  isHealthy: boolean;
  activeCommissionerCount: number;
  issues: CommissionerIntegrityIssue[];
};

export function toCommissionerMembershipRow(
  membership: MembershipLike | CommissionerMembershipSnapshot,
): CommissionerMembershipRow {
  return {
    membershipId: membership.id,
    userId: membership.userId,
    email: membership.user.email,
    name: membership.user.name,
    leagueRole: toCanonicalLeagueRole(membership.role),
    teamId: membership.teamId,
    teamName: membership.team?.name ?? null,
    createdAt: membership.createdAt.toISOString(),
  };
}

export function toPendingCommissionerDesignationRow(
  pendingDesignation: LeagueCommissionerIntegritySnapshot["pendingCommissionerDesignation"],
): PendingCommissionerDesignationRow | null {
  if (!pendingDesignation) {
    return null;
  }

  return {
    inviteId: pendingDesignation.inviteId,
    email: pendingDesignation.email,
    createdAt: pendingDesignation.createdAt.toISOString(),
    expiresAt: pendingDesignation.expiresAt.toISOString(),
    invitedBy: pendingDesignation.invitedBy
      ? {
          userId: pendingDesignation.invitedBy.userId,
          email: pendingDesignation.invitedBy.email,
          name: pendingDesignation.invitedBy.name,
        }
      : null,
    targetMembership: pendingDesignation.targetMembership
      ? {
          membershipId: pendingDesignation.targetMembership.membershipId,
          userId: pendingDesignation.targetMembership.userId,
          email: pendingDesignation.targetMembership.email,
          leagueRole: toCanonicalLeagueRole(pendingDesignation.targetMembership.leagueRole),
        }
      : null,
    conflict: pendingDesignation.conflict
      ? {
          code: pendingDesignation.conflict.code,
          message: pendingDesignation.conflict.message,
        }
      : null,
  };
}

export function toCommissionerIntegrityRow(
  integrity: Pick<
    LeagueCommissionerIntegritySnapshot,
    "status" | "issues" | "activeCommissioners"
  >,
): CommissionerIntegrityRow {
  return {
    status: integrity.status,
    isHealthy: integrity.status === "HEALTHY",
    activeCommissionerCount: integrity.activeCommissioners.length,
    issues: integrity.issues,
  };
}
