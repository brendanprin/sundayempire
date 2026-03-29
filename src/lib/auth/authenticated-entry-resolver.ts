import { LeaguePhase } from "@prisma/client";
import { getAuthActorForLeague } from "@/lib/auth";
import { listAccessibleLeagueContextsForUser, type LeagueContext } from "@/lib/league-context";
import { resolveAuthenticatedLeagueEntry, type AuthenticatedLeagueEntry } from "@/lib/auth-entry";
import { CanonicalLeagueRole, toCanonicalLeagueRole } from "@/lib/role-model";
import { prisma } from "@/lib/prisma";

export type AuthenticatedEntryResolution = 
  | {
      kind: "no_league_access";
      route: "/dashboard" | "/select-league";
      context: {
        hasLeagues: false;
        totalLeagues: 0;
      };
    }
  | {
      kind: "single_league_entry";
      route: string; // `/league/${leagueId}` or specific phase route
      context: {
        hasLeagues: true;
        totalLeagues: 1;
        activeLeague: ResolvedLeagueContext;
        userRole: CanonicalLeagueRole;
        hasTeamAccess: boolean;
        currentPhase: LeaguePhase | null;
        isCommissioner: boolean;
      };
    }
  | {
      kind: "multiple_league_choice";
      route: "/dashboard" | "/select-league";
      context: {
        hasLeagues: true;
        totalLeagues: number;
        leagues: ResolvedLeagueContext[];
      };
    };

export type ResolvedLeagueContext = {
  leagueId: string;
  leagueName: string;
  seasonId: string | null;
  seasonYear: number | null;
  currentPhase: LeaguePhase | null;
  userRole: CanonicalLeagueRole;
  teamId: string | null;
  teamName: string | null;
  hasTeamAccess: boolean;
  isCommissioner: boolean;
};

/**
 * Server-authoritative resolver for authenticated entry routing.
 * Determines user context and appropriate landing route in a single operation.
 */
export async function resolveAuthenticatedEntry(
  userId: string,
  preferredLeagueId?: string | null
): Promise<AuthenticatedEntryResolution> {
  // Get all leagues this user has access to
  const accessibleContexts = await listAccessibleLeagueContextsForUser(userId);
  
  if (accessibleContexts.length === 0) {
    return {
      kind: "no_league_access",
      route: "/select-league",
      context: {
        hasLeagues: false,
        totalLeagues: 0,
      },
    };
  }

  // Resolve league entry type (single vs multiple)
  const leagueEntry = resolveAuthenticatedLeagueEntry(
    accessibleContexts.map(ctx => ctx.leagueId)
  );

  if (leagueEntry.kind === "single") {
    // Single league - resolve full context and determine best route
    const leagueContext = accessibleContexts[0];
    const resolvedContext = await resolveLeagueUserContext(userId, leagueContext);
    const targetRoute = determineOptimalRoute(resolvedContext);

    return {
      kind: "single_league_entry",
      route: targetRoute,
      context: {
        hasLeagues: true,
        totalLeagues: 1,
        activeLeague: resolvedContext,
        userRole: resolvedContext.userRole,
        hasTeamAccess: resolvedContext.hasTeamAccess,
        currentPhase: resolvedContext.currentPhase,
        isCommissioner: resolvedContext.isCommissioner,
      },
    };
  }

  // Multiple leagues - resolve contexts for selection
  const resolvedContexts = await Promise.all(
    accessibleContexts.map(ctx => resolveLeagueUserContext(userId, ctx))
  );

  // If user has a preferred league ID and it's accessible, prioritize it
  if (preferredLeagueId) {
    const preferredContext = resolvedContexts.find(ctx => ctx.leagueId === preferredLeagueId);
    if (preferredContext) {
      const targetRoute = determineOptimalRoute(preferredContext);
      return {
        kind: "single_league_entry",
        route: targetRoute,
        context: {
          hasLeagues: true,
          totalLeagues: 1, // Single league selected, even though user has access to multiple
          activeLeague: preferredContext,
          userRole: preferredContext.userRole,
          hasTeamAccess: preferredContext.hasTeamAccess,
          currentPhase: preferredContext.currentPhase,
          isCommissioner: preferredContext.isCommissioner,
        },
      };
    }
  }

  return {
    kind: "multiple_league_choice",
    route: "/select-league",
    context: {
      hasLeagues: true,
      totalLeagues: resolvedContexts.length,
      leagues: resolvedContexts,
    },
  };
}

/**
 * Resolve complete user context for a specific league
 */
async function resolveLeagueUserContext(
  userId: string,
  leagueContext: LeagueContext
): Promise<ResolvedLeagueContext> {
  // Get user's league membership and role directly
  const leagueMembership = await prisma.leagueMembership.findFirst({
    where: {
      userId,
      leagueId: leagueContext.leagueId,
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!leagueMembership) {
    throw new Error(`No league membership found for user ${userId} in league ${leagueContext.leagueId}`);
  }

  const userRole = toCanonicalLeagueRole(leagueMembership.role);
  const isCommissioner = userRole === "COMMISSIONER";
  const hasTeamAccess = Boolean(leagueMembership.teamId);

  // Get current season and phase information
  const currentSeason = await prisma.season.findFirst({
    where: {
      leagueId: leagueContext.leagueId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      year: true,
      phase: true,
    },
  });

  return {
    leagueId: leagueContext.leagueId,
    leagueName: leagueContext.leagueName,
    seasonId: currentSeason?.id ?? null,
    seasonYear: currentSeason?.year ?? null,
    currentPhase: currentSeason?.phase ?? null,
    userRole,
    teamId: leagueMembership.teamId,
    teamName: leagueMembership.team?.name ?? null,
    hasTeamAccess,
    isCommissioner,
  };
}

/**
 * Determine the optimal route based on user role, team assignment, and current phase
 */
function determineOptimalRoute(context: ResolvedLeagueContext): string {
  const baseRoute = `/league/${context.leagueId}`;
  
  // For commissioners, direct to commissioner operations dashboard for oversight
  if (context.isCommissioner) {
    return "/commissioner";
  }

  // For users without team access, direct to teams directory for team selection/onboarding
  if (!context.hasTeamAccess) {
    return "/teams";
  }

  // For team managers, consider current phase for optimal routing
  if (context.currentPhase) {
    switch (context.currentPhase) {
      case "ROOKIE_DRAFT":
        return `${baseRoute}/draft/rookie`;
      case "AUCTION_MAIN_DRAFT":
        return `${baseRoute}/draft/veteran-auction`;
      case "REGULAR_SEASON":
      case "PLAYOFFS":
        // During active seasons, direct to team command center
        return context.teamId ? `/teams/${context.teamId}` : "/teams";
      case "TAG_OPTION_COMPLIANCE":
        // During compliance periods, direct to team for roster management
        return context.teamId ? `/teams/${context.teamId}` : "/teams";
      case "OFFSEASON_ROLLOVER":
      case "PRESEASON_SETUP":
      default:
        // During offseason, team workspace is still the best starting point for managers
        return context.teamId ? `/teams/${context.teamId}` : "/teams";
    }
  }

  // Fallback: team workspace for managers, teams directory for unassigned
  return context.teamId ? `/teams/${context.teamId}` : "/teams";
}

/**
 * Lightweight version for quick route determination without full context resolution
 */
export async function resolveQuickAuthenticatedRoute(
  userId: string,
  preferredLeagueId?: string | null
): Promise<string> {
  const resolution = await resolveAuthenticatedEntry(userId, preferredLeagueId);
  return resolution.route;
}