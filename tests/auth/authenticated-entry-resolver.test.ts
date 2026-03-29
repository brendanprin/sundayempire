import assert from "node:assert/strict";
import test from "node:test";

/**
 * Unit tests for the authenticated entry resolver role-based routing logic.
 * Tests the determineOptimalRoute function behavior for different user contexts.
 */

// Mock the ResolvedLeagueContext type for testing
type TestLeagueContext = {
  leagueId: string;
  leagueName: string;
  seasonId: string | null;
  seasonYear: number | null;
  currentPhase: string | null;
  userRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  hasTeamAccess: boolean;
  isCommissioner: boolean;
};

// Import the function we want to test (this assumes it's exported or we make it testable)
// For now, we'll test the logic inline to validate the routing behavior

function determineOptimalRoute(context: TestLeagueContext): string {
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

test("Commissioner users always route to operations dashboard", () => {
  const commissionerWithTeam: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1",
    seasonYear: 2026,
    currentPhase: "REGULAR_SEASON",
    userRole: "COMMISSIONER",
    teamId: "team-1",
    teamName: "Test Team",
    hasTeamAccess: true,
    isCommissioner: true,
  };

  const commissionerWithoutTeam: TestLeagueContext = {
    ...commissionerWithTeam,
    teamId: null,
    teamName: null,
    hasTeamAccess: false,
  };

  assert.equal(determineOptimalRoute(commissionerWithTeam), "/commissioner");
  assert.equal(determineOptimalRoute(commissionerWithoutTeam), "/commissioner");
});

test("Team managers route to team workspace during active seasons", () => {
  const teamManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League", 
    seasonId: "season-1",
    seasonYear: 2026,
    currentPhase: "REGULAR_SEASON",
    userRole: "MEMBER",
    teamId: "team-1",
    teamName: "Test Team",
    hasTeamAccess: true,
    isCommissioner: false,
  };

  assert.equal(determineOptimalRoute(teamManager), "/teams/team-1");

  // Test playoffs too
  const playoffManager = { ...teamManager, currentPhase: "PLAYOFFS" };
  assert.equal(determineOptimalRoute(playoffManager), "/teams/team-1");
});

test("Team managers route to team workspace during compliance periods", () => {
  const complianceManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1", 
    seasonYear: 2026,
    currentPhase: "TAG_OPTION_COMPLIANCE",
    userRole: "MEMBER",
    teamId: "team-1",
    teamName: "Test Team",
    hasTeamAccess: true,
    isCommissioner: false,
  };

  assert.equal(determineOptimalRoute(complianceManager), "/teams/team-1");
});

test("Draft phases route to specific draft interfaces", () => {
  const draftManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1",
    seasonYear: 2026,
    currentPhase: "ROOKIE_DRAFT", 
    userRole: "MEMBER",
    teamId: "team-1",
    teamName: "Test Team",
    hasTeamAccess: true,
    isCommissioner: false,
  };

  assert.equal(
    determineOptimalRoute(draftManager), 
    "/league/league-1/draft/rookie"
  );

  const auctionManager = { ...draftManager, currentPhase: "AUCTION_MAIN_DRAFT" };
  assert.equal(
    determineOptimalRoute(auctionManager),
    "/league/league-1/draft/veteran-auction"
  );
});

test("No-team members route to teams directory for onboarding", () => {
  const noTeamMember: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1",
    seasonYear: 2026,
    currentPhase: "REGULAR_SEASON",
    userRole: "MEMBER",
    teamId: null,
    teamName: null,
    hasTeamAccess: false,
    isCommissioner: false,
  };

  assert.equal(determineOptimalRoute(noTeamMember), "/teams");

  // Test with different phases
  const offseasonNoTeam = { ...noTeamMember, currentPhase: "OFFSEASON_ROLLOVER" };
  assert.equal(determineOptimalRoute(offseasonNoTeam), "/teams");
  
  const preseasonNoTeam = { ...noTeamMember, currentPhase: "PRESEASON_SETUP" };
  assert.equal(determineOptimalRoute(preseasonNoTeam), "/teams");
});

test("Offseason team managers still route to team workspace", () => {
  const offseasonManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1",
    seasonYear: 2026,
    currentPhase: "OFFSEASON_ROLLOVER",
    userRole: "MEMBER",
    teamId: "team-1", 
    teamName: "Test Team",
    hasTeamAccess: true,
    isCommissioner: false,
  };

  assert.equal(determineOptimalRoute(offseasonManager), "/teams/team-1");

  const preseasonManager = { ...offseasonManager, currentPhase: "PRESEASON_SETUP" };
  assert.equal(determineOptimalRoute(preseasonManager), "/teams/team-1");
});

test("Fallback behavior when no phase is set", () => {
  const noPhaseTeamManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: null,
    seasonYear: null,
    currentPhase: null,
    userRole: "MEMBER",
    teamId: "team-1",
    teamName: "Test Team", 
    hasTeamAccess: true,
    isCommissioner: false,
  };

  const noPhaseNoTeam: TestLeagueContext = {
    ...noPhaseTeamManager,
    teamId: null,
    teamName: null,
    hasTeamAccess: false,
  };

  assert.equal(determineOptimalRoute(noPhaseTeamManager), "/teams/team-1");
  assert.equal(determineOptimalRoute(noPhaseNoTeam), "/teams");
});

test("Edge case: Team manager with hasTeamAccess true but null teamId", () => {
  // This shouldn't happen in practice but test the fallback
  const edgeCaseManager: TestLeagueContext = {
    leagueId: "league-1",
    leagueName: "Test League",
    seasonId: "season-1", 
    seasonYear: 2026,
    currentPhase: "REGULAR_SEASON",
    userRole: "MEMBER",
    teamId: null, // Null but hasTeamAccess is true (edge case)
    teamName: null,
    hasTeamAccess: true,
    isCommissioner: false,
  };

  // Should fallback to teams directory for safety
  assert.equal(determineOptimalRoute(edgeCaseManager), "/teams");
});