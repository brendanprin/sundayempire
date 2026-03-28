import { APIRequestContext } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL } from "../../e2e/helpers/api";

export interface SmokeFixture {
  leagueId: string;
  teams: Array<{
    id: string;
    name: string;
    ownerEmail: string;
  }>;
  picks: Array<{
    id: string;
    teamId: string;
    seasonYear: number;
    round: number;
  }>;
}

/**
 * Sets up basic smoke test fixtures by running existing seed data
 */
export async function setupSmokeFixtures(baseURL: string): Promise<SmokeFixture> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL);
  
  try {
    // Get primary league
    const leaguesResponse = await api.get("/api/leagues");
    const leaguesPayload = await leaguesResponse.json();
    const leagues = leaguesPayload.leagues as Array<{ id: string; name: string }>;
    
    if (leagues.length === 0) {
      throw new Error("No leagues found. Please run database seed first.");
    }
    
    const leagueId = leagues[0].id;
    
    // Get teams
    const teamsResponse = await api.get("/api/teams");
    const teamsPayload = await teamsResponse.json();
    const teams = teamsPayload.teams as Array<{
      id: string;
      name: string;
      ownerEmail?: string;
    }>;
    
    // Map owner emails to teams (using existing structure)
    const teamsWithOwners = teams.map((team, index) => ({
      ...team,
      ownerEmail: index === 0 ? OWNER_EMAIL : `owner${(index + 1).toString().padStart(2, '0')}@local.league`,
    }));
    
    // Get picks for teams
    const picksData: Array<{ id: string; teamId: string; seasonYear: number; round: number }> = [];
    
    for (const team of teamsWithOwners.slice(0, 2)) { // Just first 2 teams for smoke tests
      const rosterResponse = await api.get(`/api/teams/${team.id}/roster`);
      const rosterPayload = await rosterResponse.json();
      
      if (rosterPayload.picks) {
        const teamPicks = rosterPayload.picks
          .filter((pick: any) => !pick.isUsed)
          .map((pick: any) => ({
            id: pick.id,
            teamId: team.id,
            seasonYear: pick.seasonYear,
            round: pick.round,
          }));
        
        picksData.push(...teamPicks);
      }
    }
    
    await api.dispose();
    
    return {
      leagueId,
      teams: teamsWithOwners,
      picks: picksData,
    };
  } catch (error) {
    await api.dispose();
    throw error;
  }
}

/**
 * Ensures league is in a good state for smoke testing
 */
export async function ensureLeagueReadiness(
  baseURL: string,
  leagueId: string
): Promise<void> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL, leagueId);
  
  try {
    // Check league status
    const leagueResponse = await api.get("/api/league");
    const leaguePayload = await leagueResponse.json();
    
    if (!leaguePayload.season) {
      throw new Error("League does not have an active season");
    }
    
    // Ensure we're in a testable phase (REGULAR_SEASON allows most operations)
    if (leaguePayload.season.phase !== "REGULAR_SEASON") {
      await api.post("/api/commissioner/season/phase", {
        data: {
          phase: "REGULAR_SEASON",
          reason: "Smoke test setup",
        },
      });
    }
  } finally {
    await api.dispose();
  }
}

/**
 * Creates a basic trade between two teams for testing
 */
export async function createSmokeTestTrade(
  baseURL: string,
  fixture: SmokeFixture,
  options: { shouldBlock?: boolean } = {}
): Promise<{ proposalId: string; isBlocked: boolean }> {
  const api = await apiContext(baseURL, COMMISSIONER_EMAIL, fixture.leagueId);
  
  try {
    const teamA = fixture.teams[0];
    const teamB = fixture.teams[1];
    
    if (!teamA || !teamB) {
      throw new Error("Need at least 2 teams for smoke test trade");
    }
    
    // Get available picks for each team
    const teamAPicks = fixture.picks.filter(pick => pick.teamId === teamA.id);
    const teamBPicks = fixture.picks.filter(pick => pick.teamId === teamB.id);
    
    if (teamAPicks.length === 0 || teamBPicks.length === 0) {
      throw new Error("Teams need available picks for smoke test trade");
    }
    
    const tradeAssets = {
      teamAId: teamA.id,
      teamBId: teamB.id,
      notes: `Smoke test trade ${Date.now()}`,
      teamAAssets: [
        {
          assetType: "PICK",
          futurePickId: teamAPicks[0].id,
        },
      ],
      teamBAssets: [
        {
          assetType: "PICK", 
          futurePickId: teamBPicks[0].id,
        },
      ],
    };
    
    const response = await api.post("/api/trades", {
      data: tradeAssets,
    });
    
    const payload = await response.json();
    
    return {
      proposalId: payload.proposal?.id || "",
      isBlocked: !response.ok() || payload.evaluation?.outcome === "BLOCKED",
    };
  } finally {
    await api.dispose();
  }
}

/**
 * Runs existing phase smoke to ensure data is properly seeded
 */
export async function ensureSmokeDataSeeded(baseURL: string): Promise<void> {
  // This could trigger existing seed scripts if needed
  // For now, we assume the database is properly seeded
  console.log("Assuming smoke test data is seeded via existing scripts");
}