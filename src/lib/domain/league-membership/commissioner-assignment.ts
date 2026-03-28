import { LeagueRole, Prisma, PrismaClient } from "@prisma/client";

type CommissionerAssignmentDbClient = PrismaClient | Prisma.TransactionClient;

const COMMISSIONER_MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  leagueId: true,
  role: true,
  teamId: true,
  createdAt: true,
  user: {
    select: {
      email: true,
      name: true,
    },
  },
  team: {
    select: {
      name: true,
    },
  },
} as const;

const PENDING_COMMISSIONER_INVITE_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  expiresAt: true,
  invitedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const;

export type CommissionerMembershipSnapshot = {
  id: string;
  userId: string;
  leagueId: string;
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

export type CommissionerAssignmentOperation =
  | "COMMISSIONER_TRANSFER"
  | "COMMISSIONER_INVITE_ACCEPTANCE"
  | "LEAGUE_BOOTSTRAP"
  | "COMMISSIONER_RECOVERY";

export type AssignLeagueCommissionerInput = {
  leagueId: string;
  targetUserId: string;
  operation: CommissionerAssignmentOperation;
  expectedCurrentCommissionerUserId?: string | null;
  allowMissingCurrentCommissioner?: boolean;
  allowConflictingCurrentCommissioners?: boolean;
};

export type AssignLeagueCommissionerResult = {
  commissioner: CommissionerMembershipSnapshot;
  previousCommissioner: CommissionerMembershipSnapshot | null;
  changed: boolean;
};

export type CommissionerAssignmentErrorCode =
  | "TARGET_MEMBERSHIP_NOT_FOUND"
  | "CURRENT_COMMISSIONER_REQUIRED"
  | "EXPECTED_CURRENT_COMMISSIONER_MISMATCH"
  | "COMMISSIONER_STATE_INVALID"
  | "COMMISSIONER_CONTINUITY_CHECK_FAILED";

export class CommissionerAssignmentError extends Error {
  readonly code: CommissionerAssignmentErrorCode;
  readonly operation: CommissionerAssignmentOperation;
  readonly leagueId: string;

  constructor(
    code: CommissionerAssignmentErrorCode,
    input: {
      operation: CommissionerAssignmentOperation;
      leagueId: string;
      message?: string;
    },
  ) {
    super(input.message ?? code);
    this.name = "CommissionerAssignmentError";
    this.code = code;
    this.operation = input.operation;
    this.leagueId = input.leagueId;
  }
}

export type CommissionerIntegrityStatus =
  | "HEALTHY"
  | "MISSING_COMMISSIONER"
  | "MULTIPLE_COMMISSIONERS";

export type CommissionerIntegrityIssueCode =
  | "MISSING_ACTIVE_COMMISSIONER"
  | "MULTIPLE_ACTIVE_COMMISSIONERS"
  | "PENDING_DESIGNATION_TARGET_ALREADY_MEMBER"
  | "PENDING_DESIGNATION_TARGET_ALREADY_COMMISSIONER";

export type CommissionerIntegrityIssue = {
  code: CommissionerIntegrityIssueCode;
  severity: "error" | "warning";
  message: string;
};

export type PendingCommissionerDesignationConflictCode =
  | "TARGET_ALREADY_MEMBER"
  | "TARGET_ALREADY_COMMISSIONER";

export type PendingCommissionerDesignationSnapshot = {
  inviteId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  invitedBy: {
    userId: string;
    email: string;
    name: string | null;
  } | null;
  targetMembership: {
    membershipId: string;
    userId: string;
    email: string;
    leagueRole: LeagueRole;
  } | null;
  conflict: {
    code: PendingCommissionerDesignationConflictCode;
    message: string;
  } | null;
};

export type LeagueCommissionerIntegritySnapshot = {
  leagueId: string;
  status: CommissionerIntegrityStatus;
  activeCommissioners: CommissionerMembershipSnapshot[];
  operationalCommissioner: CommissionerMembershipSnapshot | null;
  issues: CommissionerIntegrityIssue[];
  pendingCommissionerDesignation: PendingCommissionerDesignationSnapshot | null;
};

export type CommissionerIntegrityRepairErrorCode =
  | "INTEGRITY_ALREADY_HEALTHY"
  | "INTEGRITY_REPAIR_FAILED";

export class CommissionerIntegrityRepairError extends Error {
  readonly code: CommissionerIntegrityRepairErrorCode;
  readonly leagueId: string;

  constructor(
    code: CommissionerIntegrityRepairErrorCode,
    input: {
      leagueId: string;
      message?: string;
    },
  ) {
    super(input.message ?? code);
    this.name = "CommissionerIntegrityRepairError";
    this.code = code;
    this.leagueId = input.leagueId;
  }
}

export type RepairLeagueCommissionerIntegrityInput = {
  leagueId: string;
  targetUserId: string;
};

export type RepairLeagueCommissionerIntegrityResult = {
  beforeIntegrity: LeagueCommissionerIntegritySnapshot;
  afterIntegrity: LeagueCommissionerIntegritySnapshot;
  assignment: AssignLeagueCommissionerResult;
};

function supportsStrictCommissionerQueries(client: CommissionerAssignmentDbClient) {
  const membershipClient = client.leagueMembership as unknown as {
    findMany?: unknown;
    count?: unknown;
  };

  return (
    typeof membershipClient.findMany === "function" &&
    typeof membershipClient.count === "function"
  );
}

function supportsPendingCommissionerInviteQueries(client: CommissionerAssignmentDbClient) {
  const unsafeClient = client as unknown as {
    leagueInvite?: {
      findFirst?: unknown;
    };
    user?: {
      findUnique?: unknown;
    };
  };

  return (
    typeof unsafeClient.leagueInvite?.findFirst === "function" &&
    typeof unsafeClient.user?.findUnique === "function"
  );
}

function resolveIntegrityStatus(commissionerCount: number): CommissionerIntegrityStatus {
  if (commissionerCount === 0) {
    return "MISSING_COMMISSIONER";
  }

  if (commissionerCount === 1) {
    return "HEALTHY";
  }

  return "MULTIPLE_COMMISSIONERS";
}

async function findPendingCommissionerDesignation(
  client: CommissionerAssignmentDbClient,
  leagueId: string,
): Promise<PendingCommissionerDesignationSnapshot | null> {
  if (!supportsPendingCommissionerInviteQueries(client)) {
    return null;
  }

  const now = new Date();
  const invite = await client.leagueInvite.findFirst({
    where: {
      leagueId,
      intendedRole: LeagueRole.COMMISSIONER,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: PENDING_COMMISSIONER_INVITE_SELECT,
  });

  if (!invite) {
    return null;
  }

  const targetUser = await client.user.findUnique({
    where: {
      email: invite.email,
    },
    select: {
      id: true,
      email: true,
    },
  });

  const targetMembership = targetUser
    ? await client.leagueMembership.findUnique({
        where: {
          userId_leagueId: {
            userId: targetUser.id,
            leagueId,
          },
        },
        select: {
          id: true,
          userId: true,
          role: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      })
    : null;

  let conflict: PendingCommissionerDesignationSnapshot["conflict"] = null;
  if (targetMembership) {
    if (targetMembership.role === LeagueRole.COMMISSIONER) {
      conflict = {
        code: "TARGET_ALREADY_COMMISSIONER",
        message:
          "Pending commissioner designation target already holds active commissioner authority.",
      };
    } else {
      conflict = {
        code: "TARGET_ALREADY_MEMBER",
        message: "Pending commissioner designation target already has active league membership.",
      };
    }
  }

  return {
    inviteId: invite.id,
    email: invite.email,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    invitedBy: invite.invitedByUser
      ? {
          userId: invite.invitedByUser.id,
          email: invite.invitedByUser.email,
          name: invite.invitedByUser.name,
        }
      : null,
    targetMembership: targetMembership
      ? {
          membershipId: targetMembership.id,
          userId: targetMembership.userId,
          email: targetMembership.user.email,
          leagueRole: targetMembership.role,
        }
      : null,
    conflict,
  };
}

function buildIntegrityIssues(input: {
  status: CommissionerIntegrityStatus;
  pendingCommissionerDesignation: PendingCommissionerDesignationSnapshot | null;
}): CommissionerIntegrityIssue[] {
  const issues: CommissionerIntegrityIssue[] = [];

  if (input.status === "MISSING_COMMISSIONER") {
    issues.push({
      code: "MISSING_ACTIVE_COMMISSIONER",
      severity: "error",
      message: "No active commissioner exists for this league.",
    });
  }

  if (input.status === "MULTIPLE_COMMISSIONERS") {
    issues.push({
      code: "MULTIPLE_ACTIVE_COMMISSIONERS",
      severity: "error",
      message: "Multiple active commissioner memberships were detected for this league.",
    });
  }

  if (input.pendingCommissionerDesignation?.conflict?.code === "TARGET_ALREADY_MEMBER") {
    issues.push({
      code: "PENDING_DESIGNATION_TARGET_ALREADY_MEMBER",
      severity: "warning",
      message: input.pendingCommissionerDesignation.conflict.message,
    });
  }

  if (
    input.pendingCommissionerDesignation?.conflict?.code ===
    "TARGET_ALREADY_COMMISSIONER"
  ) {
    issues.push({
      code: "PENDING_DESIGNATION_TARGET_ALREADY_COMMISSIONER",
      severity: "warning",
      message: input.pendingCommissionerDesignation.conflict.message,
    });
  }

  return issues;
}

export async function getLeagueCommissionerIntegrity(
  client: CommissionerAssignmentDbClient,
  input: {
    leagueId: string;
    includePendingCommissionerDesignation?: boolean;
  },
): Promise<LeagueCommissionerIntegritySnapshot> {
  const activeCommissioners = await client.leagueMembership.findMany({
    where: {
      leagueId: input.leagueId,
      role: LeagueRole.COMMISSIONER,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: COMMISSIONER_MEMBERSHIP_SELECT,
  });

  const pendingCommissionerDesignation = input.includePendingCommissionerDesignation
    ? await findPendingCommissionerDesignation(client, input.leagueId)
    : null;

  const status = resolveIntegrityStatus(activeCommissioners.length);
  const issues = buildIntegrityIssues({
    status,
    pendingCommissionerDesignation,
  });

  return {
    leagueId: input.leagueId,
    status,
    activeCommissioners,
    operationalCommissioner: status === "HEALTHY" ? activeCommissioners[0] ?? null : null,
    issues,
    pendingCommissionerDesignation,
  };
}

async function assertSingleOperationalCommissioner(
  client: CommissionerAssignmentDbClient,
  input: {
    leagueId: string;
    operation: CommissionerAssignmentOperation;
  },
) {
  const commissionerCount = await client.leagueMembership.count({
    where: {
      leagueId: input.leagueId,
      role: LeagueRole.COMMISSIONER,
    },
  });

  if (commissionerCount !== 1) {
    throw new CommissionerAssignmentError("COMMISSIONER_CONTINUITY_CHECK_FAILED", {
      operation: input.operation,
      leagueId: input.leagueId,
      message: "League must have exactly one active commissioner after commissioner assignment.",
    });
  }
}

export async function assignLeagueCommissioner(
  client: CommissionerAssignmentDbClient,
  input: AssignLeagueCommissionerInput,
): Promise<AssignLeagueCommissionerResult> {
  const targetMembership = await client.leagueMembership.findUnique({
    where: {
      userId_leagueId: {
        userId: input.targetUserId,
        leagueId: input.leagueId,
      },
    },
    select: COMMISSIONER_MEMBERSHIP_SELECT,
  });
  if (!targetMembership) {
    throw new CommissionerAssignmentError("TARGET_MEMBERSHIP_NOT_FOUND", {
      operation: input.operation,
      leagueId: input.leagueId,
      message: "Target user does not have league membership access.",
    });
  }

  if (!supportsStrictCommissionerQueries(client)) {
    let previousCommissioner: CommissionerMembershipSnapshot | null = null;

    if (input.expectedCurrentCommissionerUserId) {
      const expectedCurrent = await client.leagueMembership.findUnique({
        where: {
          userId_leagueId: {
            userId: input.expectedCurrentCommissionerUserId,
            leagueId: input.leagueId,
          },
        },
        select: COMMISSIONER_MEMBERSHIP_SELECT,
      });

      if (!expectedCurrent || expectedCurrent.role !== LeagueRole.COMMISSIONER) {
        throw new CommissionerAssignmentError("EXPECTED_CURRENT_COMMISSIONER_MISMATCH", {
          operation: input.operation,
          leagueId: input.leagueId,
          message: "Current commissioner changed before reassignment completed.",
        });
      }

      previousCommissioner = expectedCurrent;
    } else if (!input.allowMissingCurrentCommissioner) {
      throw new CommissionerAssignmentError("CURRENT_COMMISSIONER_REQUIRED", {
        operation: input.operation,
        leagueId: input.leagueId,
        message: "An active commissioner is required for this operation.",
      });
    }

    await client.leagueMembership.updateMany({
      where: {
        leagueId: input.leagueId,
        role: LeagueRole.COMMISSIONER,
        userId: {
          not: input.targetUserId,
        },
      },
      data: {
        role: LeagueRole.MEMBER,
      },
    });

    const promotedMembership = await client.leagueMembership.update({
      where: {
        userId_leagueId: {
          userId: input.targetUserId,
          leagueId: input.leagueId,
        },
      },
      data: {
        role: LeagueRole.COMMISSIONER,
      },
      select: COMMISSIONER_MEMBERSHIP_SELECT,
    });

    return {
      commissioner: promotedMembership,
      previousCommissioner,
      changed:
        !previousCommissioner ||
        previousCommissioner.userId !== promotedMembership.userId ||
        targetMembership.role !== LeagueRole.COMMISSIONER,
    };
  }

  const existingCommissioners = await client.leagueMembership.findMany({
    where: {
      leagueId: input.leagueId,
      role: LeagueRole.COMMISSIONER,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: COMMISSIONER_MEMBERSHIP_SELECT,
  });

  if (existingCommissioners.length > 1 && !input.allowConflictingCurrentCommissioners) {
    throw new CommissionerAssignmentError("COMMISSIONER_STATE_INVALID", {
      operation: input.operation,
      leagueId: input.leagueId,
      message: "League has more than one active commissioner.",
    });
  }

  let currentCommissioner = existingCommissioners[0] ?? null;

  if (input.expectedCurrentCommissionerUserId) {
    const expectedCurrent =
      existingCommissioners.find(
        (commissioner) => commissioner.userId === input.expectedCurrentCommissionerUserId,
      ) ?? null;

    if (!expectedCurrent) {
      throw new CommissionerAssignmentError("EXPECTED_CURRENT_COMMISSIONER_MISMATCH", {
        operation: input.operation,
        leagueId: input.leagueId,
        message: "Current commissioner changed before reassignment completed.",
      });
    }

    currentCommissioner = expectedCurrent;
  }

  if (!currentCommissioner && !input.allowMissingCurrentCommissioner) {
    throw new CommissionerAssignmentError("CURRENT_COMMISSIONER_REQUIRED", {
      operation: input.operation,
      leagueId: input.leagueId,
      message: "An active commissioner is required for this operation.",
    });
  }

  if (
    existingCommissioners.length === 1 &&
    currentCommissioner?.userId === input.targetUserId &&
    targetMembership.role === LeagueRole.COMMISSIONER
  ) {
    await assertSingleOperationalCommissioner(client, {
      leagueId: input.leagueId,
      operation: input.operation,
    });
    return {
      commissioner: targetMembership,
      previousCommissioner: currentCommissioner,
      changed: false,
    };
  }

  if (existingCommissioners.length > 1 && input.allowConflictingCurrentCommissioners) {
    const demoted = await client.leagueMembership.updateMany({
      where: {
        leagueId: input.leagueId,
        role: LeagueRole.COMMISSIONER,
        userId: {
          not: input.targetUserId,
        },
      },
      data: {
        role: LeagueRole.MEMBER,
      },
    });

    const expectedDemotions = existingCommissioners.filter(
      (commissioner) => commissioner.userId !== input.targetUserId,
    ).length;

    if (demoted.count !== expectedDemotions) {
      throw new CommissionerAssignmentError("COMMISSIONER_STATE_INVALID", {
        operation: input.operation,
        leagueId: input.leagueId,
        message: "Could not demote conflicting commissioner memberships safely.",
      });
    }
  } else if (currentCommissioner && currentCommissioner.userId !== input.targetUserId) {
    const demoted = await client.leagueMembership.updateMany({
      where: {
        leagueId: input.leagueId,
        userId: currentCommissioner.userId,
        role: LeagueRole.COMMISSIONER,
      },
      data: {
        role: LeagueRole.MEMBER,
      },
    });

    if (demoted.count !== 1) {
      throw new CommissionerAssignmentError("COMMISSIONER_STATE_INVALID", {
        operation: input.operation,
        leagueId: input.leagueId,
        message: "Could not demote the previous commissioner safely.",
      });
    }
  }

  const promotedMembership = await client.leagueMembership.update({
    where: {
      userId_leagueId: {
        userId: input.targetUserId,
        leagueId: input.leagueId,
      },
    },
    data: {
      role: LeagueRole.COMMISSIONER,
    },
    select: COMMISSIONER_MEMBERSHIP_SELECT,
  });

  await assertSingleOperationalCommissioner(client, {
    leagueId: input.leagueId,
    operation: input.operation,
  });

  return {
    commissioner: promotedMembership,
    previousCommissioner: currentCommissioner,
    changed:
      !currentCommissioner ||
      currentCommissioner.userId !== promotedMembership.userId ||
      targetMembership.role !== LeagueRole.COMMISSIONER,
  };
}

export async function promoteLeagueMemberToCommissioner(
  client: CommissionerAssignmentDbClient,
  input: {
    leagueId: string;
    userId: string;
  },
) {
  const result = await assignLeagueCommissioner(client, {
    leagueId: input.leagueId,
    targetUserId: input.userId,
    operation: "COMMISSIONER_INVITE_ACCEPTANCE",
    allowMissingCurrentCommissioner: true,
  });

  return result.commissioner;
}

export async function assertLeagueHasOperationalCommissioner(
  client: CommissionerAssignmentDbClient,
  input: {
    leagueId: string;
    operation: CommissionerAssignmentOperation;
  },
) {
  await assertSingleOperationalCommissioner(client, input);
}

export async function repairLeagueCommissionerIntegrity(
  client: CommissionerAssignmentDbClient,
  input: RepairLeagueCommissionerIntegrityInput,
): Promise<RepairLeagueCommissionerIntegrityResult> {
  const beforeIntegrity = await getLeagueCommissionerIntegrity(client, {
    leagueId: input.leagueId,
    includePendingCommissionerDesignation: true,
  });

  if (beforeIntegrity.status === "HEALTHY") {
    throw new CommissionerIntegrityRepairError("INTEGRITY_ALREADY_HEALTHY", {
      leagueId: input.leagueId,
      message: "League commissioner integrity is already healthy.",
    });
  }

  const assignment = await assignLeagueCommissioner(client, {
    leagueId: input.leagueId,
    targetUserId: input.targetUserId,
    operation: "COMMISSIONER_RECOVERY",
    allowMissingCurrentCommissioner: true,
    allowConflictingCurrentCommissioners: true,
  });

  const afterIntegrity = await getLeagueCommissionerIntegrity(client, {
    leagueId: input.leagueId,
    includePendingCommissionerDesignation: true,
  });

  if (afterIntegrity.status !== "HEALTHY") {
    throw new CommissionerIntegrityRepairError("INTEGRITY_REPAIR_FAILED", {
      leagueId: input.leagueId,
      message: "Commissioner integrity remained unhealthy after repair.",
    });
  }

  return {
    beforeIntegrity,
    afterIntegrity,
    assignment,
  };
}
