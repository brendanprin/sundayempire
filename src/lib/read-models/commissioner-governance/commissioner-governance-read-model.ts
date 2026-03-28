import { LeagueRole, Prisma, PrismaClient, TransactionType } from "@prisma/client";
import {
  getLeagueCommissionerIntegrity,
  type CommissionerIntegrityStatus,
} from "@/lib/domain/league-membership/commissioner-assignment";
import {
  toCommissionerIntegrityRow,
  toCommissionerMembershipRow,
  toPendingCommissionerDesignationRow,
  type CommissionerIntegrityRow,
  type CommissionerMembershipRow,
  type PendingCommissionerDesignationRow,
} from "@/lib/domain/league-membership/commissioner-governance-serialization";

type CommissionerGovernanceDbClient = PrismaClient | Prisma.TransactionClient;

type MembershipSelectRow = {
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

type GovernanceHistoryEventKind =
  | "COMMISSIONER_REPAIR"
  | "COMMISSIONER_TRANSFER"
  | "COMMISSIONER_OVERRIDE";

export type CommissionerGovernanceHistoryRow = {
  id: string;
  kind: GovernanceHistoryEventKind;
  summary: string;
  createdAt: string;
  actor: {
    email: string | null;
    leagueRole: string | null;
  } | null;
  targetEmail: string | null;
};

export type LeagueCommissionerGovernanceSnapshot = {
  leagueId: string;
  integrity: CommissionerIntegrityRow;
  commissioner: CommissionerMembershipRow | null;
  members: CommissionerMembershipRow[];
  pendingCommissionerDesignation: PendingCommissionerDesignationRow | null;
  history: CommissionerGovernanceHistoryRow[];
};

export type AdminLeagueCommissionerIntegrityRow = {
  leagueId: string;
  leagueName: string;
  createdAt: string;
  membershipCount: number;
  activeCommissionerCount: number;
  integrityStatus: CommissionerIntegrityStatus;
};

export type AdminCommissionerIntegrityFilter =
  | CommissionerIntegrityStatus
  | "UNHEALTHY";

export type AdminCommissionerIntegritySort =
  | "INTEGRITY_SEVERITY_DESC"
  | "INTEGRITY_SEVERITY_ASC"
  | "CREATED_AT_DESC"
  | "CREATED_AT_ASC";

export const DEFAULT_ADMIN_COMMISSIONER_INTEGRITY_SORT: AdminCommissionerIntegritySort =
  "INTEGRITY_SEVERITY_DESC";

export type AdminLeagueCommissionerIntegrityIndexPage = {
  rows: AdminLeagueCommissionerIntegrityRow[];
  page: number;
  pageSize: number;
  sort: AdminCommissionerIntegritySort;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveIntegrityStatus(activeCommissionerCount: number): CommissionerIntegrityStatus {
  if (activeCommissionerCount === 0) {
    return "MISSING_COMMISSIONER";
  }

  if (activeCommissionerCount === 1) {
    return "HEALTHY";
  }

  return "MULTIPLE_COMMISSIONERS";
}

function matchesIntegrityFilter(
  status: CommissionerIntegrityStatus,
  filter: AdminCommissionerIntegrityFilter | null,
) {
  if (!filter) {
    return true;
  }

  if (filter === "UNHEALTHY") {
    return status !== "HEALTHY";
  }

  return status === filter;
}

const INTEGRITY_SEVERITY_RANK: Record<CommissionerIntegrityStatus, number> = {
  MISSING_COMMISSIONER: 3,
  MULTIPLE_COMMISSIONERS: 2,
  HEALTHY: 1,
};

function compareByCreatedAt(
  left: AdminLeagueCommissionerIntegrityRow,
  right: AdminLeagueCommissionerIntegrityRow,
  direction: "asc" | "desc",
) {
  const leftTimestamp = new Date(left.createdAt).getTime();
  const rightTimestamp = new Date(right.createdAt).getTime();

  if (leftTimestamp === rightTimestamp) {
    return left.leagueName.localeCompare(right.leagueName);
  }

  return direction === "asc" ? leftTimestamp - rightTimestamp : rightTimestamp - leftTimestamp;
}

function sortAdminIntegrityRows(
  rows: AdminLeagueCommissionerIntegrityRow[],
  sort: AdminCommissionerIntegritySort,
) {
  return [...rows].sort((left, right) => {
    if (sort === "CREATED_AT_DESC") {
      return compareByCreatedAt(left, right, "desc");
    }

    if (sort === "CREATED_AT_ASC") {
      return compareByCreatedAt(left, right, "asc");
    }

    const leftSeverity = INTEGRITY_SEVERITY_RANK[left.integrityStatus];
    const rightSeverity = INTEGRITY_SEVERITY_RANK[right.integrityStatus];

    if (leftSeverity !== rightSeverity) {
      return sort === "INTEGRITY_SEVERITY_DESC"
        ? rightSeverity - leftSeverity
        : leftSeverity - rightSeverity;
    }

    return compareByCreatedAt(left, right, "desc");
  });
}

function parseHistoryMetadata(metadata: Prisma.JsonValue | null): {
  kind: GovernanceHistoryEventKind;
  actorEmail: string | null;
  actorLeagueRole: string | null;
  targetEmail: string | null;
} {
  if (!metadata || !isRecord(metadata)) {
    return {
      kind: "COMMISSIONER_OVERRIDE",
      actorEmail: null,
      actorLeagueRole: null,
      targetEmail: null,
    };
  }

  const repair = isRecord(metadata.repair) ? metadata.repair : null;
  if (repair) {
    const repairedBy = isRecord(repair.repairedBy) ? repair.repairedBy : null;
    return {
      kind: "COMMISSIONER_REPAIR",
      actorEmail: repairedBy ? readString(repairedBy, "email") : null,
      actorLeagueRole: repairedBy ? readString(repairedBy, "leagueRole") : null,
      targetEmail: readString(repair, "targetEmail"),
    };
  }

  const transfer = isRecord(metadata.transfer) ? metadata.transfer : null;
  if (transfer) {
    return {
      kind: "COMMISSIONER_TRANSFER",
      actorEmail: readString(transfer, "fromEmail"),
      actorLeagueRole: null,
      targetEmail: readString(transfer, "toEmail"),
    };
  }

  const actor = isRecord(metadata.actor) ? metadata.actor : null;
  return {
    kind: "COMMISSIONER_OVERRIDE",
    actorEmail: actor ? readString(actor, "email") : null,
    actorLeagueRole: actor ? readString(actor, "leagueRole") : null,
    targetEmail: null,
  };
}

function toHistoryRow(row: {
  id: string;
  summary: string;
  createdAt: Date;
  metadata: Prisma.JsonValue | null;
}): CommissionerGovernanceHistoryRow {
  const parsed = parseHistoryMetadata(row.metadata);
  return {
    id: row.id,
    kind: parsed.kind,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    actor:
      parsed.actorEmail || parsed.actorLeagueRole
        ? {
            email: parsed.actorEmail,
            leagueRole: parsed.actorLeagueRole,
          }
        : null,
    targetEmail: parsed.targetEmail,
  };
}

export async function readLeagueCommissionerGovernanceSnapshot(
  client: CommissionerGovernanceDbClient,
  input: {
    leagueId: string;
    includePendingCommissionerDesignation?: boolean;
    historyLimit?: number;
  },
): Promise<LeagueCommissionerGovernanceSnapshot> {
  const historyLimit = Math.max(1, Math.min(input.historyLimit ?? 25, 100));
  const [memberships, integrity, historyRows] = await Promise.all([
    client.leagueMembership.findMany({
      where: {
        leagueId: input.leagueId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        userId: true,
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
      },
    }),
    getLeagueCommissionerIntegrity(client, {
      leagueId: input.leagueId,
      includePendingCommissionerDesignation: input.includePendingCommissionerDesignation,
    }),
    client.transaction.findMany({
      where: {
        leagueId: input.leagueId,
        type: TransactionType.COMMISSIONER_OVERRIDE,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: historyLimit,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        metadata: true,
      },
    }),
  ]);

  const memberRows = (memberships as MembershipSelectRow[]).map((membership) =>
    toCommissionerMembershipRow(membership),
  );

  return {
    leagueId: input.leagueId,
    integrity: toCommissionerIntegrityRow(integrity),
    commissioner: integrity.operationalCommissioner
      ? toCommissionerMembershipRow(integrity.operationalCommissioner)
      : null,
    members: memberRows,
    pendingCommissionerDesignation: toPendingCommissionerDesignationRow(
      integrity.pendingCommissionerDesignation,
    ),
    history: historyRows.map((row) => toHistoryRow(row)),
  };
}

export async function readAdminLeagueCommissionerIntegrityIndex(
  client: CommissionerGovernanceDbClient,
  input: {
    searchQuery?: string;
    integrityFilter?: AdminCommissionerIntegrityFilter | null;
    sort?: AdminCommissionerIntegritySort | null;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<AdminLeagueCommissionerIntegrityIndexPage> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 25, 100));
  const normalizedSearchQuery = input.searchQuery?.trim() ?? "";
  const normalizedFilter = input.integrityFilter ?? null;
  const normalizedSort = input.sort ?? DEFAULT_ADMIN_COMMISSIONER_INTEGRITY_SORT;
  const leagueWhere =
    normalizedSearchQuery.length > 0
      ? {
          name: {
            contains: normalizedSearchQuery,
          },
        }
      : undefined;

  const statusFiltered = normalizedFilter !== null;
  const sortUsesCreatedDateOnly =
    normalizedSort === "CREATED_AT_DESC" || normalizedSort === "CREATED_AT_ASC";
  if (!statusFiltered && sortUsesCreatedDateOnly) {
    const [totalCount, leagues] = await Promise.all([
      client.league.count({
        where: leagueWhere,
      }),
      client.league.findMany({
        where: leagueWhere,
        orderBy: {
          createdAt: normalizedSort === "CREATED_AT_ASC" ? "asc" : "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: {
              memberships: true,
            },
          },
        },
      }),
    ]);

    const leagueIds = leagues.map((league) => league.id);
    const commissionerCounts =
      leagueIds.length > 0
        ? await client.leagueMembership.groupBy({
            by: ["leagueId"],
            where: {
              role: LeagueRole.COMMISSIONER,
              leagueId: {
                in: leagueIds,
              },
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const commissionerCountByLeagueId = new Map<string, number>(
      commissionerCounts.map((row) => [row.leagueId, row._count._all]),
    );
    const rows = leagues.map((league) => {
      const activeCommissionerCount = commissionerCountByLeagueId.get(league.id) ?? 0;
      return {
        leagueId: league.id,
        leagueName: league.name,
        createdAt: league.createdAt.toISOString(),
        membershipCount: league._count.memberships,
        activeCommissionerCount,
        integrityStatus: resolveIntegrityStatus(activeCommissionerCount),
      };
    });

    return {
      rows,
      page,
      pageSize,
      sort: normalizedSort,
      totalCount,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize),
      hasPreviousPage: page > 1,
      hasNextPage: page * pageSize < totalCount,
    };
  }

  const leagues = await client.league.findMany({
    where: leagueWhere,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  const leagueIds = leagues.map((league) => league.id);
  const commissionerCounts =
    leagueIds.length > 0
      ? await client.leagueMembership.groupBy({
          by: ["leagueId"],
          where: {
            role: LeagueRole.COMMISSIONER,
            leagueId: {
              in: leagueIds,
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];
  const commissionerCountByLeagueId = new Map<string, number>(
    commissionerCounts.map((row) => [row.leagueId, row._count._all]),
  );

  const filteredRows = leagues
    .map((league) => {
      const activeCommissionerCount = commissionerCountByLeagueId.get(league.id) ?? 0;
      const integrityStatus = resolveIntegrityStatus(activeCommissionerCount);
      return {
        leagueId: league.id,
        leagueName: league.name,
        createdAt: league.createdAt.toISOString(),
        membershipCount: league._count.memberships,
        activeCommissionerCount,
        integrityStatus,
      };
    })
    .filter((row) => matchesIntegrityFilter(row.integrityStatus, normalizedFilter));
  const sortedRows = sortAdminIntegrityRows(filteredRows, normalizedSort);

  const totalCount = sortedRows.length;
  const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: pagedRows,
    page,
    pageSize,
    sort: normalizedSort,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize),
    hasPreviousPage: page > 1,
    hasNextPage: page * pageSize < totalCount,
  };
}
