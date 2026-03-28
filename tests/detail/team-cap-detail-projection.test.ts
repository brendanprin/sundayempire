import assert from "node:assert/strict";
import test from "node:test";
import { createTeamCapDetailProjection } from "@/lib/read-models/team/team-cap-detail-projection";

test("team cap detail projection reads current roster, contracts, and dead cap without mutating state", async () => {
  const projection = createTeamCapDetailProjection({
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
    rosterSlot: {
      async findMany() {
        return [
          {
            id: "slot-1",
            slotType: "STARTER",
            slotLabel: "QB1",
            week: null,
            playerId: "player-1",
            player: {
              id: "player-1",
              name: "Alpha QB",
              position: "QB",
              nflTeam: "BUF",
              injuryStatus: null,
              isRestricted: false,
            },
          },
          {
            id: "slot-2",
            slotType: "BENCH",
            slotLabel: "BN1",
            week: null,
            playerId: "player-2",
            player: {
              id: "player-2",
              name: "Bench WR",
              position: "WR",
              nflTeam: "MIN",
              injuryStatus: "Questionable",
              isRestricted: false,
            },
          },
        ];
      },
    },
    rosterAssignment: {
      async findMany() {
        return [
          {
            id: "assignment-1",
            playerId: "player-1",
            contractId: "contract-1",
            acquisitionType: "AUCTION",
            rosterStatus: "ACTIVE",
            hostPlatformReferenceId: "host-1",
            effectiveAt: new Date("2026-02-01T00:00:00.000Z"),
            endedAt: null,
          },
          {
            id: "assignment-2",
            playerId: "player-2",
            contractId: "contract-2",
            acquisitionType: "WAIVER",
            rosterStatus: "ACTIVE",
            hostPlatformReferenceId: null,
            effectiveAt: new Date("2026-02-10T00:00:00.000Z"),
            endedAt: null,
          },
        ];
      },
    },
    contract: {
      async findMany() {
        return [
          {
            id: "contract-1",
            playerId: "player-1",
            salary: 32,
            yearsTotal: 3,
            yearsRemaining: 2,
            startYear: 2025,
            endYear: 2027,
            isRookieContract: false,
            rookieOptionEligible: false,
            rookieOptionExercised: false,
            isFranchiseTag: true,
            status: "TAGGED",
            endedAt: null,
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-01T00:00:00.000Z"),
            player: {
              id: "player-1",
              name: "Alpha QB",
              position: "QB",
              nflTeam: "BUF",
            },
            seasonLedgers: [
              {
                annualSalary: 32,
                yearsRemainingAtStart: 2,
                ledgerStatus: "TAGGED",
              },
            ],
            franchiseTagUsages: [
              {
                id: "tag-1",
                finalTagSalary: 32,
                priorSalary: 27,
              },
            ],
            optionDecisions: [],
          },
          {
            id: "contract-2",
            playerId: "player-2",
            salary: 8,
            yearsTotal: 1,
            yearsRemaining: 1,
            startYear: 2026,
            endYear: 2026,
            isRookieContract: true,
            rookieOptionEligible: true,
            rookieOptionExercised: false,
            isFranchiseTag: false,
            status: "EXPIRING",
            endedAt: null,
            createdAt: new Date("2026-02-10T00:00:00.000Z"),
            updatedAt: new Date("2026-03-05T00:00:00.000Z"),
            player: {
              id: "player-2",
              name: "Bench WR",
              position: "WR",
              nflTeam: "MIN",
            },
            seasonLedgers: [
              {
                annualSalary: 8,
                yearsRemainingAtStart: 1,
                ledgerStatus: "EXPIRING",
              },
            ],
            franchiseTagUsages: [],
            optionDecisions: [
              {
                id: "option-1",
                decisionType: "EXERCISE",
                effectiveContractYearsAdded: 2,
                decidedAt: new Date("2026-04-10T00:00:00.000Z"),
              },
            ],
          },
        ];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [
          {
            id: "dead-cap-current",
            sourceContractId: "contract-legacy",
            sourceEventType: "CUT",
            systemCalculatedAmount: 11,
            adjustedAmount: null,
            isOverride: false,
            overrideReason: null,
            createdAt: new Date("2026-03-15T00:00:00.000Z"),
            appliesToSeason: {
              year: 2026,
            },
            player: {
              id: "player-3",
              name: "Former RB",
              position: "RB",
            },
          },
          {
            id: "dead-cap-future",
            sourceContractId: "contract-legacy",
            sourceEventType: "CUT",
            systemCalculatedAmount: 4,
            adjustedAmount: 6,
            isOverride: true,
            overrideReason: "Commissioner adjustment",
            createdAt: new Date("2026-03-16T00:00:00.000Z"),
            appliesToSeason: {
              year: 2027,
            },
            player: {
              id: "player-3",
              name: "Former RB",
              position: "RB",
            },
          },
        ];
      },
    },
    complianceIssue: {
      async findMany() {
        return [
          {
            id: "issue-1",
            severity: "WARNING",
            status: "OPEN",
            code: "ROSTER_SIZE",
            title: "Roster is one spot light",
            dueAt: new Date("2026-09-20T00:00:00.000Z"),
          },
          {
            id: "issue-2",
            severity: "ERROR",
            status: "IN_REVIEW",
            code: "CAP_HARD",
            title: "Hard cap exceeded",
            dueAt: new Date("2026-09-10T00:00:00.000Z"),
          },
        ];
      },
    },
    futurePick: {
      async findMany() {
        return [
          {
            id: "pick-1",
            seasonYear: 2027,
            round: 1,
            overall: 7,
            originalTeam: {
              id: "team-4",
              name: "Trade Partner",
              abbreviation: "TP",
            },
          },
        ];
      },
    },
    transaction: {
      async findMany() {
        return [
          {
            id: "tx-1",
            type: "CONTRACT_UPDATE",
            summary: "Tagged Alpha QB.",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            player: {
              id: "player-1",
              name: "Alpha QB",
              position: "QB",
            },
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    teamId: "team-1",
    seasonId: "season-1",
    now: new Date("2026-09-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.team.name, "Cap Casualties");
  assert.equal(result.capSummary.mirrorOnly, true);
  assert.equal(result.capSummary.capSpaceSoft, 20);
  assert.equal(result.roster.starters.length, 1);
  assert.equal(result.roster.bench.length, 1);
  assert.equal(result.roster.starters[0]?.contract?.status, "TAGGED");
  assert.equal(result.contracts[0]?.franchiseTagUsage?.finalTagSalary, 32);
  assert.equal(result.contracts[1]?.optionDecision?.decisionType, "EXERCISE");
  assert.equal(result.deadCap.currentSeasonTotal, 11);
  assert.equal(result.deadCap.futureCarryTotal, 6);
  assert.equal(result.complianceSummary.highestSeverity, "ERROR");
  assert.equal(result.topIssues[0]?.id, "issue-2");
  assert.equal(result.ownedPicks.length, 1);
  assert.equal(result.recentTransactions[0]?.id, "tx-1");
  assert.equal(result.availability.rosterAssignmentCoverageComplete, true);
  assert.equal(result.availability.contractHistoryAvailable, false);
});

test("team cap detail projection stays empty-state safe when support records are missing", async () => {
  const projection = createTeamCapDetailProjection({
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "Sparse Team",
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
    rosterSlot: {
      async findMany() {
        return [
          {
            id: "slot-1",
            slotType: "BENCH",
            slotLabel: "BN1",
            week: null,
            playerId: "player-1",
            player: {
              id: "player-1",
              name: "Unassigned Player",
              position: "WR",
              nflTeam: null,
              injuryStatus: null,
              isRestricted: false,
            },
          },
        ];
      },
    },
    rosterAssignment: {
      async findMany() {
        return [];
      },
    },
    contract: {
      async findMany() {
        return [];
      },
    },
    deadCapCharge: {
      async findMany() {
        return [];
      },
    },
    complianceIssue: {
      async findMany() {
        return [];
      },
    },
    futurePick: {
      async findMany() {
        return [];
      },
    },
    transaction: {
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
  assert.equal(result.capSummary.stateAvailable, false);
  assert.equal(result.capSummary.rosterLimit, null);
  assert.equal(result.roster.totalCount, 1);
  assert.equal(result.roster.bench[0]?.assignment, null);
  assert.equal(result.contracts.length, 0);
  assert.equal(result.deadCap.charges.length, 0);
  assert.equal(result.topIssues.length, 0);
  assert.equal(result.availability.rulesetAvailable, false);
  assert.equal(result.availability.teamSeasonStateAvailable, false);
  assert.equal(result.availability.rosterAssignmentCoverageComplete, false);
  assert.equal(result.availability.contractHistoryAvailable, false);
});
