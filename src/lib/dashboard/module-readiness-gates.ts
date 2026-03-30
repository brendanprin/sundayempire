/**
 * Phase-Aware Dashboard Module Visibility
 * 
 * Gates dashboard module visibility based on league readiness state to prevent
 * overwhelming commissioners with future-oriented modules before the league
 * is ready for them.
 */

import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";

export type ModuleReadinessGate = {
  /** Whether the module should be visible at all */
  visible: boolean;
  /** Whether to show in collapsed/deemphasized state */
  collapsed?: boolean;
  /** Reason for gating (for debugging/testing) */
  reason?: string;
};

export type DashboardModuleGates = {
  rookiePicksModule: ModuleReadinessGate;
  activityModule: ModuleReadinessGate;
  tradeHealthModule: ModuleReadinessGate;
  draftReadinessModule: ModuleReadinessGate;
  complianceModule: ModuleReadinessGate;
  secondaryZone: ModuleReadinessGate;
};

/**
 * Assess league readiness state for module gating decisions
 */
function assessLeagueReadiness(dashboard: LeagueLandingDashboardProjection): {
  isNewLeague: boolean;
  hasMinimalTeams: boolean;
  hasActiveMembers: boolean;
  hasOperationalActivity: boolean;
  isInSetupPhase: boolean;
  hasPendingInvites: boolean;
  setupProgress: number;
} {
  const teamCount = dashboard.leagueDashboard.summary.teamCount;
  const memberCount = dashboard.leagueDashboard.summary.membershipCount;
  const setupProgress = dashboard.setupChecklist.completionPercent;
  const hasActivity = dashboard.activitySummary.recentActivity.length > 0 ||
                     dashboard.activitySummary.commissionerNote !== null;
  
  // Consider league "new" if setup is incomplete or very few teams/members
  const isNewLeague = !dashboard.setupChecklist.isComplete || 
                     teamCount < 3 || 
                     memberCount < 2 ||
                     setupProgress < 80;
  
  const hasMinimalTeams = teamCount >= 2;
  const hasActiveMembers = memberCount >= 2;
  const isInSetupPhase = dashboard.leagueDashboard.status.alertLevel === "setup_required";

  // Check for pending invites (still in recruitment phase)
  const hasPendingInvites = dashboard.leagueDashboard.summary.openIssueCount > 0 &&
                           dashboard.leagueDashboard.status.alertLevel === "setup_required";

  return {
    isNewLeague,
    hasMinimalTeams,
    hasActiveMembers,
    hasOperationalActivity: hasActivity,
    isInSetupPhase,
    hasPendingInvites,
    setupProgress,
  };
}

/**
 * Determine module visibility gates based on league readiness
 */
export function getDashboardModuleGates(dashboard: LeagueLandingDashboardProjection): DashboardModuleGates {
  const readiness = assessLeagueReadiness(dashboard);

  // For commissioners in new leagues, defer mature modules until ready
  const shouldDeferMatureModules = dashboard.viewer.leagueRole === "COMMISSIONER" && 
                                  readiness.isNewLeague;

  return {
    // Rookie picks only meaningful with established franchises
    rookiePicksModule: {
      visible: !shouldDeferMatureModules || readiness.hasActiveMembers,
      collapsed: shouldDeferMatureModules && readiness.hasMinimalTeams,
      reason: shouldDeferMatureModules ? "League not ready for draft planning" : undefined,
    },

    // Activity module only relevant with operational league
    activityModule: {
      visible: !shouldDeferMatureModules || readiness.hasOperationalActivity,
      collapsed: shouldDeferMatureModules && readiness.hasActiveMembers,
      reason: shouldDeferMatureModules ? "No meaningful league activity yet" : undefined,
    },

    // Trade health only relevant with multiple active teams
    tradeHealthModule: {
      visible: !shouldDeferMatureModules || (readiness.hasActiveMembers && readiness.setupProgress > 75),
      reason: shouldDeferMatureModules ? "Trade system not relevant during setup" : undefined,
    },

    // Draft readiness only shows when approaching draft season
    draftReadinessModule: {
      visible: !shouldDeferMatureModules || readiness.setupProgress > 90,
      collapsed: shouldDeferMatureModules && readiness.setupProgress > 75,
      reason: shouldDeferMatureModules ? "Draft operations premature" : undefined,
    },

    // Compliance module always visible for commissioners (but collapsed in setup)
    complianceModule: {
      visible: true,
      collapsed: shouldDeferMatureModules,
      reason: shouldDeferMatureModules ? "Compliance less critical during setup" : undefined,
    },

    // Secondary zone visibility depends on having meaningful content
    secondaryZone: {
      visible: !shouldDeferMatureModules || 
               readiness.hasActiveMembers ||
               readiness.hasOperationalActivity,
      collapsed: shouldDeferMatureModules,
      reason: shouldDeferMatureModules ? "Secondary content deferred during setup" : undefined,
    },
  };
}

/**
 * Check if commissioner should see setup-focused interface
 */
export function shouldPrioritizeSetup(dashboard: LeagueLandingDashboardProjection): boolean {
  if (dashboard.viewer.leagueRole !== "COMMISSIONER") {
    return false;
  }

  const readiness = assessLeagueReadiness(dashboard);
  
  // Prioritize setup if checklist incomplete or league not operational
  return !dashboard.setupChecklist.isComplete ||
         readiness.isInSetupPhase ||
         readiness.hasPendingInvites ||
         readiness.setupProgress < 75;
}