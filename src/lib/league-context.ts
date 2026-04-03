import { LeagueRuleSet, Prisma, Season, Team } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { resolveAuthenticatedLeagueEntry } from "@/lib/auth-entry";
import {
  ACTIVE_LEAGUE_COOKIE,
  AUTH_EMAIL_COOKIE,
  AUTH_SESSION_COOKIE,
  HEADER_EMAIL,
  HEADER_LEAGUE_ID,
  getAuthenticatedUser,
  isLegacyAuthCompatibilityEnabled,
} from "@/lib/auth";
import { computeActiveCapTotal } from "@/lib/domain/contracts/active-cap-calculator";
import { computeDeadCapTotal } from "@/lib/domain/contracts/dead-cap-calculator";
import { createTeamFinancialStateService } from "@/lib/domain/contracts/team-financial-state-service";
import { selectPreferredSeason } from "@/lib/domain/lifecycle/season-selection";
import { prisma } from "@/lib/prisma";

export type LeagueContext = {
  leagueId: string;
  leagueName: string;
  seasonId: string;
  seasonYear: number;
  ruleset: LeagueRuleSet;
};

export type TeamCapSummary = {
  teamId: string;
  rosterCount: number;
  activeCapHit: number;
  deadCapHit: number;
  totalCapHit: number;
  capSpaceSoft: number;
  capSpaceHard: number;
  complianceStatus: "ok" | "warning" | "error";
};

export type ActiveLeagueContextResolution =
  | {
      status: "unauthenticated";
      requestedLeagueId: string | null;
      requestedUserId: null;
      accessibleContexts: LeagueContext[];
      activeContext: null;
    }
  | {
      status: "no_accessible_leagues";
      requestedLeagueId: string | null;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: null;
    }
  | {
      status: "selection_required";
      requestedLeagueId: null;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: null;
    }
  | {
      status: "requested_league_inaccessible";
      requestedLeagueId: string;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: null;
    }
  | {
      status: "selected";
      requestedLeagueId: string;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: LeagueContext;
    }
  | {
      status: "single_accessible_league";
      requestedLeagueId: null;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: LeagueContext;
    }
  | {
      status: "legacy_compat_default";
      requestedLeagueId: null;
      requestedUserId: string;
      accessibleContexts: LeagueContext[];
      activeContext: LeagueContext;
    };

type LeagueWithContextParts = {
  id: string;
  name: string;
  seasons: {
    id: string;
    year: number;
    status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
  }[];
  rulesets: LeagueRuleSet[];
};

function toLeagueContext(league: LeagueWithContextParts): LeagueContext | null {
  const season = selectPreferredSeason(league.seasons);
  if (!season || league.rulesets.length === 0) {
    return null;
  }

  return {
    leagueId: league.id,
    leagueName: league.name,
    seasonId: season.id,
    seasonYear: season.year,
    ruleset: league.rulesets[0],
  };
}

async function resolveRequestLeagueSelector() {
  try {
    const [headerStore, cookieStore, user] = await Promise.all([headers(), cookies(), getAuthenticatedUser()]);
    const requestedLeagueId =
      headerStore.get(HEADER_LEAGUE_ID)?.trim() || cookieStore.get(ACTIVE_LEAGUE_COOKIE)?.value?.trim() || null;
    const hasDurableSession = Boolean(cookieStore.get(AUTH_SESSION_COOKIE)?.value?.trim());
    const hasLegacyIdentity =
      isLegacyAuthCompatibilityEnabled() &&
      (Boolean(headerStore.get(HEADER_EMAIL)?.trim()) ||
        Boolean(cookieStore.get(AUTH_EMAIL_COOKIE)?.value?.trim()));

    return {
      requestedLeagueId,
      requestedUserId: user?.id ?? null,
      usesLegacyIdentityFallback: !hasDurableSession && hasLegacyIdentity,
    };
  } catch {
    return {
      requestedLeagueId: null,
      requestedUserId: null,
      usesLegacyIdentityFallback: false,
    };
  }
}

async function findLeagueContexts(where?: Prisma.LeagueWhereInput) {
  const leagues = await prisma.league.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      seasons: {
        orderBy: { year: "desc" },
        select: {
          id: true,
          year: true,
          status: true,
        },
      },
      rulesets: {
        where: { isActive: true },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  return leagues
    .map((league) =>
      toLeagueContext({
        id: league.id,
        name: league.name,
        seasons: league.seasons.map((season) => ({ id: season.id, year: season.year, status: season.status })),
        rulesets: league.rulesets,
      }),
    )
    .filter((context): context is LeagueContext => Boolean(context));
}

export async function getLeagueContextById(leagueId: string): Promise<LeagueContext | null> {
  const contexts = await findLeagueContexts({
    id: leagueId,
  });

  return contexts[0] ?? null;
}

export async function listAccessibleLeagueContextsForUser(userId: string): Promise<LeagueContext[]> {
  return findLeagueContexts({
    memberships: {
      some: {
        userId,
      },
    },
  });
}

export async function resolveActiveLeagueContext(): Promise<ActiveLeagueContextResolution> {
  const { requestedLeagueId, requestedUserId, usesLegacyIdentityFallback } =
    await resolveRequestLeagueSelector();

  if (!requestedUserId) {
    return {
      status: "unauthenticated",
      requestedLeagueId,
      requestedUserId: null,
      accessibleContexts: [],
      activeContext: null,
    };
  }

  const accessibleContexts = await listAccessibleLeagueContextsForUser(requestedUserId);
  const entry = resolveAuthenticatedLeagueEntry(
    accessibleContexts.map((context) => context.leagueId),
  );

  if (entry.kind === "none") {
    return {
      status: "no_accessible_leagues",
      requestedLeagueId,
      requestedUserId,
      accessibleContexts,
      activeContext: null,
    };
  }

  if (requestedLeagueId) {
    const activeContext =
      accessibleContexts.find((context) => context.leagueId === requestedLeagueId) ?? null;

    if (!activeContext) {
      return {
        status: "requested_league_inaccessible",
        requestedLeagueId,
        requestedUserId,
        accessibleContexts,
        activeContext: null,
      };
    }

    return {
      status: "selected",
      requestedLeagueId,
      requestedUserId,
      accessibleContexts,
      activeContext,
    };
  }

  if (entry.kind === "single") {
    const activeContext = accessibleContexts[0];

    if (!activeContext) {
      return {
        status: "no_accessible_leagues",
        requestedLeagueId,
        requestedUserId,
        accessibleContexts: [],
        activeContext: null,
      };
    }

    return {
      status: "single_accessible_league",
      requestedLeagueId: null,
      requestedUserId,
      accessibleContexts,
      activeContext,
    };
  }

  if (usesLegacyIdentityFallback) {
    const activeContext = accessibleContexts[0];

    if (!activeContext) {
      return {
        status: "no_accessible_leagues",
        requestedLeagueId,
        requestedUserId,
        accessibleContexts: [],
        activeContext: null,
      };
    }

    return {
      status: "legacy_compat_default",
      requestedLeagueId: null,
      requestedUserId,
      accessibleContexts,
      activeContext,
    };
  }

  return {
    status: "selection_required",
    requestedLeagueId: null,
    requestedUserId,
    accessibleContexts,
    activeContext: null,
  };
}

export async function getActiveLeagueContext(): Promise<LeagueContext | null> {
  const resolution = await resolveActiveLeagueContext();
  return resolution.activeContext;
}

export async function summarizeTeamCap(
  team: Pick<Team, "id">,
  season: Pick<Season, "id">,
  ruleset: Pick<LeagueRuleSet, "rosterSize" | "salaryCapSoft" | "salaryCapHard">,
): Promise<TeamCapSummary> {
  const [rosterCount, financials] = await Promise.all([
    prisma.rosterAssignment.count({
      where: {
        teamId: team.id,
        seasonId: season.id,
        endedAt: null,
        rosterStatus: {
          in: ["ACTIVE", "IR", "MIRRORED_ONLY"],
        },
      },
    }),
    // Legacy team summary reads must stay side-effect free.
    createTeamFinancialStateService(prisma).readTeamSeasonFinancials({
      teamId: team.id,
      seasonId: season.id,
    }),
  ]);

  const activeCapHit = financials.activeCapTotal;
  const deadCapHit = financials.deadCapTotal;
  const totalCapHit = activeCapHit + deadCapHit;
  const capSpaceSoft = ruleset.salaryCapSoft - totalCapHit;
  const capSpaceHard = ruleset.salaryCapHard - totalCapHit;

  let complianceStatus: TeamCapSummary["complianceStatus"] = "ok";

  if (rosterCount > ruleset.rosterSize || totalCapHit > ruleset.salaryCapSoft) {
    complianceStatus = "warning";
  }

  if (totalCapHit > ruleset.salaryCapHard) {
    complianceStatus = "error";
  }

  return {
    teamId: team.id,
    rosterCount,
    activeCapHit,
    deadCapHit,
    totalCapHit,
    capSpaceSoft,
    capSpaceHard,
    complianceStatus,
  };
}

export async function batchSummarizeTeamCap(
  teams: Array<Pick<Team, "id">>,
  season: Pick<Season, "id">,
  ruleset: Pick<LeagueRuleSet, "rosterSize" | "salaryCapSoft" | "salaryCapHard">,
): Promise<Map<string, TeamCapSummary>> {
  if (teams.length === 0) {
    return new Map();
  }

  const teamIds = teams.map((t) => t.id);

  const [rosterCounts, ledgers, deadCapCharges] = await Promise.all([
    prisma.rosterAssignment.groupBy({
      by: ["teamId"],
      where: {
        teamId: { in: teamIds },
        seasonId: season.id,
        endedAt: null,
        rosterStatus: { in: ["ACTIVE", "IR", "MIRRORED_ONLY"] },
      },
      _count: { _all: true },
    }),
    prisma.contractSeasonLedger.findMany({
      where: {
        seasonId: season.id,
        contract: { teamId: { in: teamIds } },
      },
      select: {
        annualSalary: true,
        ledgerStatus: true,
        contract: { select: { teamId: true } },
      },
    }),
    prisma.deadCapCharge.findMany({
      where: {
        teamId: { in: teamIds },
        appliesToSeasonId: season.id,
      },
      select: {
        teamId: true,
        systemCalculatedAmount: true,
        adjustedAmount: true,
      },
    }),
  ]);

  const rosterCountByTeamId = new Map(
    rosterCounts.map((r) => [r.teamId, r._count._all]),
  );

  const ledgersByTeamId = new Map<string, Array<{ annualSalary: number; ledgerStatus: string }>>();
  for (const ledger of ledgers) {
    const teamId = ledger.contract.teamId;
    const bucket = ledgersByTeamId.get(teamId) ?? [];
    bucket.push({ annualSalary: ledger.annualSalary, ledgerStatus: ledger.ledgerStatus });
    ledgersByTeamId.set(teamId, bucket);
  }

  const deadCapByTeamId = new Map<
    string,
    Array<{ systemCalculatedAmount: number; adjustedAmount: number | null }>
  >();
  for (const charge of deadCapCharges) {
    const bucket = deadCapByTeamId.get(charge.teamId) ?? [];
    bucket.push({
      systemCalculatedAmount: charge.systemCalculatedAmount,
      adjustedAmount: charge.adjustedAmount,
    });
    deadCapByTeamId.set(charge.teamId, bucket);
  }

  const result = new Map<string, TeamCapSummary>();
  for (const team of teams) {
    const rosterCount = rosterCountByTeamId.get(team.id) ?? 0;
    const activeCapHit = computeActiveCapTotal(
      (ledgersByTeamId.get(team.id) ?? []).map((l) => ({
        annualSalary: l.annualSalary,
        ledgerStatus: l.ledgerStatus as Parameters<typeof computeActiveCapTotal>[0][number]["ledgerStatus"],
      })),
    );
    const deadCapHit = computeDeadCapTotal(deadCapByTeamId.get(team.id) ?? []);
    const totalCapHit = activeCapHit + deadCapHit;
    const capSpaceSoft = ruleset.salaryCapSoft - totalCapHit;
    const capSpaceHard = ruleset.salaryCapHard - totalCapHit;

    let complianceStatus: TeamCapSummary["complianceStatus"] = "ok";
    if (rosterCount > ruleset.rosterSize || totalCapHit > ruleset.salaryCapSoft) {
      complianceStatus = "warning";
    }
    if (totalCapHit > ruleset.salaryCapHard) {
      complianceStatus = "error";
    }

    result.set(team.id, {
      teamId: team.id,
      rosterCount,
      activeCapHit,
      deadCapHit,
      totalCapHit,
      capSpaceSoft,
      capSpaceHard,
      complianceStatus,
    });
  }

  return result;
}
