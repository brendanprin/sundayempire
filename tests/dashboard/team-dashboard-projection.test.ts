import assert from "node:assert/strict";
import test from "node:test";
import { createTeamDashboardProjection } from "@/lib/read-models/dashboard/team-dashboard-projection";

test("team dashboard projection reads authoritative season state and compliance summary", async () => {
  const projection = createTeamDashboardProjection({
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "Cap Casualties",
          abbreviation: "CAP",
          divisionLabel: "Alpha",
        };
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-1",
          leagueId: "league-1",
          year: 2026,
          status: "ACTIVE",
          phase: "REGULAR_SEASON",
          openedAt: new Date("2026-01-01T00:00:00.000Z"),
          closedAt: null,
        };
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return {
          rosterSize: 17,
          salaryCapSoft: 245,
          salaryCapHard: 300,
        };
      },
    },
    teamSeasonState: {
      async findUnique() {
        return {
          rosterCount: 16,
          activeCapTotal: 214,
          deadCapTotal: 11,
          hardCapTotal: 225,
          lastRecalculatedAt: new Date("2026-04-01T12:00:00.000Z"),
        };
      },
    },
    complianceIssue: {
      async findMany() {
        return [
          {
            severity: "WARNING",
            dueAt: new Date("2026-04-20T00:00:00.000Z"),
            status: "OPEN",
          },
          {
            severity: "ERROR",
            dueAt: new Date("2026-04-18T00:00:00.000Z"),
            status: "IN_REVIEW",
          },
        ];
      },
    },
    contract: {
      async findMany() {
        return [
          {
            id: "contract-expiring",
            status: "EXPIRING",
            rookieOptionEligible: false,
            rookieOptionExercised: false,
            optionDecisions: [],
          },
          {
            id: "contract-option",
            status: "ACTIVE",
            rookieOptionEligible: true,
            rookieOptionExercised: false,
            optionDecisions: [],
          },
          {
            id: "contract-option-done",
            status: "ACTIVE",
            rookieOptionEligible: true,
            rookieOptionExercised: false,
            optionDecisions: [{ id: "decision-1" }],
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    teamId: "team-1",
    seasonId: "season-1",
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.team.name, "Cap Casualties");
  assert.equal(result.season.currentPhase, "REGULAR_SEASON");
  assert.equal(result.season.legacyPhase, "REGULAR_SEASON");
  assert.equal(result.rosterCapSummary.stateAvailable, true);
  assert.equal(result.rosterCapSummary.mirrorOnly, true);
  assert.equal(result.rosterCapSummary.capSpaceSoft, 20);
  assert.equal(result.rosterCapSummary.capSpaceHard, 75);
  assert.equal(result.complianceSummary.openIssueCount, 2);
  assert.equal(result.complianceSummary.highestSeverity, "ERROR");
  assert.equal(result.contractSummary.expiringContractsCount, 1);
  assert.equal(result.contractSummary.unresolvedRookieOptionCount, 1);
  assert.equal(result.contractSummary.franchiseTagCandidateCount, null);
  assert.equal(result.availability.franchiseTagCandidateCountAvailable, false);
});

test("team dashboard projection stays empty-state safe when season state or ruleset is missing", async () => {
  const projection = createTeamDashboardProjection({
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "No State Team",
          abbreviation: null,
          divisionLabel: null,
        };
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-1",
          leagueId: "league-1",
          year: 2027,
          status: "ACTIVE",
          phase: "TAG_OPTION_COMPLIANCE",
          openedAt: null,
          closedAt: null,
        };
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return null;
      },
    },
    teamSeasonState: {
      async findUnique() {
        return null;
      },
    },
    complianceIssue: {
      async findMany() {
        return [];
      },
    },
    contract: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const result = await projection.read({
    teamId: "team-1",
    seasonId: "season-1",
    now: new Date("2027-03-01T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.rosterCapSummary.stateAvailable, false);
  assert.equal(result.rosterCapSummary.rosterCount, null);
  assert.equal(result.rosterCapSummary.softCapLimit, null);
  assert.equal(result.rosterCapSummary.capSpaceSoft, null);
  assert.equal(result.contractSummary.unresolvedRookieOptionCount, 0);
  assert.equal(result.contractSummary.franchiseTagCandidateCount, null);
  assert.equal(result.availability.rulesetAvailable, false);
});
