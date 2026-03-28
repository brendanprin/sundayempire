import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePlatformRole } from "@/lib/auth";
import { getLeagueContextById } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ADMIN_COMMISSIONER_INTEGRITY_SORT,
  type AdminCommissionerIntegrityFilter,
  type AdminCommissionerIntegritySort,
  readAdminLeagueCommissionerIntegrityIndex,
  readLeagueCommissionerGovernanceSnapshot,
} from "@/lib/read-models/commissioner-governance/commissioner-governance-read-model";
import { parseIntegerParam } from "@/lib/request";

function normalizeLeagueId(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIntegrityFilter(value: string | null): AdminCommissionerIntegrityFilter | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "HEALTHY" ||
    normalized === "MISSING_COMMISSIONER" ||
    normalized === "MULTIPLE_COMMISSIONERS" ||
    normalized === "UNHEALTHY"
  ) {
    return normalized;
  }

  return null;
}

function normalizeSort(value: string | null): AdminCommissionerIntegritySort | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (
    normalized === "INTEGRITY_SEVERITY_DESC" ||
    normalized === "INTEGRITY_SEVERITY_ASC" ||
    normalized === "CREATED_AT_DESC" ||
    normalized === "CREATED_AT_ASC"
  ) {
    return normalized;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const access = await requirePlatformRole(request, ["ADMIN"]);
  if (access.response || !access.user) {
    return access.response ?? apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const requestedLeagueId = normalizeLeagueId(request.nextUrl.searchParams.get("leagueId"));
  const requestedQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedFilter = normalizeIntegrityFilter(request.nextUrl.searchParams.get("status"));
  const requestedSort =
    normalizeSort(request.nextUrl.searchParams.get("sort")) ??
    DEFAULT_ADMIN_COMMISSIONER_INTEGRITY_SORT;
  const requestedPage = parseIntegerParam(request.nextUrl.searchParams.get("page"));
  const requestedPageSize = parseIntegerParam(request.nextUrl.searchParams.get("pageSize"));
  const index = await readAdminLeagueCommissionerIntegrityIndex(prisma, {
    searchQuery: requestedQuery.length > 0 ? requestedQuery : undefined,
    integrityFilter: requestedFilter,
    sort: requestedSort,
    page: requestedPage,
    pageSize: requestedPageSize,
  });

  if (index.rows.length === 0 && !requestedLeagueId) {
    return NextResponse.json({
      viewer: {
        userId: access.user.id,
        email: access.user.email,
        accountRole: access.user.platformRole,
      },
      filters: {
        query: requestedQuery,
        status: requestedFilter,
        sort: index.sort,
      },
      index,
      selectedLeagueId: null,
      selectedLeague: null,
    });
  }

  const defaultLeagueId =
    index.rows.find((league) => league.integrityStatus !== "HEALTHY")?.leagueId ??
    index.rows[0]?.leagueId ??
    null;
  const selectedLeagueId = requestedLeagueId ?? defaultLeagueId;

  if (!selectedLeagueId) {
    return NextResponse.json({
      viewer: {
        userId: access.user.id,
        email: access.user.email,
        accountRole: access.user.platformRole,
      },
      filters: {
        query: requestedQuery,
        status: requestedFilter,
        sort: index.sort,
      },
      index,
      selectedLeagueId: null,
      selectedLeague: null,
    });
  }

  const selectedLeague = await prisma.league.findUnique({
    where: {
      id: selectedLeagueId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  if (!selectedLeague) {
    return apiError(404, "LEAGUE_NOT_FOUND", "Requested league was not found.");
  }

  const [snapshot, selectedLeagueContext] = await Promise.all([
    readLeagueCommissionerGovernanceSnapshot(prisma, {
      leagueId: selectedLeague.id,
      includePendingCommissionerDesignation: true,
      historyLimit: 50,
    }),
    getLeagueContextById(selectedLeague.id),
  ]);

  return NextResponse.json({
    viewer: {
      userId: access.user.id,
      email: access.user.email,
      accountRole: access.user.platformRole,
    },
    filters: {
      query: requestedQuery,
      status: requestedFilter,
      sort: index.sort,
    },
    index,
    selectedLeagueId: selectedLeague.id,
    selectedLeague: {
      leagueId: selectedLeague.id,
      leagueName: selectedLeague.name,
      createdAt: selectedLeague.createdAt.toISOString(),
      repairContextReady: Boolean(selectedLeagueContext),
      snapshot,
    },
  });
}
