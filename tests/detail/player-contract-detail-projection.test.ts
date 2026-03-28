import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerContractDetailProjection } from "@/lib/read-models/player/player-contract-detail-projection";

test("player contract detail projection reads current team, contract, and dead cap detail", async () => {
  const projection = createPlayerContractDetailProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: "Primary league",
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "TAG_OPTION_COMPLIANCE",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    player: {
      async findUnique() {
        return {
          id: "player-1",
          name: "Rookie WR",
          position: "WR",
          nflTeam: "CHI",
          age: 23,
          yearsPro: 1,
          injuryStatus: null,
          isRestricted: false,
        };
      },
    },
    rosterSlot: {
      async findFirst() {
        return {
          slotType: "BENCH",
          slotLabel: "BN2",
          team: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
        };
      },
    },
    rosterAssignment: {
      async findFirst() {
        return {
          id: "assignment-1",
          acquisitionType: "ROOKIE_DRAFT",
          rosterStatus: "ACTIVE",
          hostPlatformReferenceId: "host-7",
          effectiveAt: new Date("2026-05-01T00:00:00.000Z"),
          team: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
        };
      },
    },
    contract: {
      async findMany() {
        return [
          {
            id: "contract-1",
            teamId: "team-1",
            salary: 5,
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
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
            updatedAt: new Date("2026-05-01T00:00:00.000Z"),
            team: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            seasonLedgers: [
              {
                annualSalary: 5,
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
                decidedAt: new Date("2026-05-10T00:00:00.000Z"),
              },
            ],
            deadCapCharges: [
              {
                id: "dead-cap-1",
                sourceEventType: "CUT",
                systemCalculatedAmount: 3,
                adjustedAmount: null,
                isOverride: false,
                overrideReason: null,
                createdAt: new Date("2026-06-01T00:00:00.000Z"),
                appliesToSeason: {
                  year: 2027,
                },
              },
            ],
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
            code: "OPTION_DECISION",
            title: "Option decision due",
            dueAt: new Date("2026-05-20T00:00:00.000Z"),
          },
        ];
      },
    },
    transaction: {
      async findMany() {
        return [
          {
            id: "tx-1",
            type: "CONTRACT_OPTION_EXERCISED",
            summary: "Exercised rookie option.",
            createdAt: new Date("2026-05-10T00:00:00.000Z"),
            player: {
              id: "player-1",
              name: "Rookie WR",
              position: "WR",
            },
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    playerId: "player-1",
    now: new Date("2026-05-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "active");
  assert.equal(result.player.name, "Rookie WR");
  assert.equal(result.rosterContext?.team.name, "Cap Casualties");
  assert.equal(result.rosterContext?.assignment?.acquisitionType, "ROOKIE_DRAFT");
  assert.equal(result.contract?.team.name, "Cap Casualties");
  assert.equal(result.contract?.optionDecision?.decisionType, "EXERCISE");
  assert.equal(result.contract?.ledger?.annualSalary, 5);
  assert.equal(result.contract?.deadCapSchedule[0]?.effectiveAmount, 3);
  assert.equal(result.complianceSummary.openIssueCount, 1);
  assert.equal(result.relatedIssues[0]?.code, "OPTION_DECISION");
  assert.equal(result.recentTransactions[0]?.id, "tx-1");
  assert.equal(result.availability.seasonResolved, true);
  assert.equal(result.availability.currentSeasonContractAvailable, true);
  assert.equal(result.availability.rosterAssignmentAvailable, true);
  assert.equal(result.availability.contractHistoryAvailable, false);
});

test("player contract detail projection stays empty-state safe when season is unresolved", async () => {
  const projection = createPlayerContractDetailProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: null,
          seasons: [
            {
              id: "season-old",
              year: 2025,
              status: "COMPLETED",
              phase: "PLAYOFFS",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    player: {
      async findUnique() {
        return {
          id: "player-1",
          name: "Free Agent RB",
          position: "RB",
          nflTeam: null,
          age: 28,
          yearsPro: 6,
          injuryStatus: "Healthy",
          isRestricted: false,
        };
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    playerId: "player-1",
    now: new Date("2026-01-10T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "unresolved");
  assert.equal(result.season, null);
  assert.equal(result.contract, null);
  assert.equal(result.rosterContext, null);
  assert.equal(result.complianceSummary.openIssueCount, 0);
  assert.deepEqual(result.relatedIssues, []);
  assert.deepEqual(result.recentTransactions, []);
  assert.equal(result.availability.seasonResolved, false);
  assert.equal(result.availability.currentSeasonContractAvailable, false);
  assert.equal(result.availability.contractHistoryAvailable, false);
});

test("player contract detail projection carries tagged-contract state and tag salary detail", async () => {
  const projection = createPlayerContractDetailProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: "Primary league",
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "TAG_OPTION_COMPLIANCE",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    player: {
      async findUnique() {
        return {
          id: "player-9",
          name: "Veteran Edge",
          position: "DE",
          nflTeam: "DAL",
          age: 29,
          yearsPro: 7,
          injuryStatus: null,
          isRestricted: false,
        };
      },
    },
    rosterSlot: {
      async findFirst() {
        return {
          slotType: "STARTER",
          slotLabel: "DL1",
          team: {
            id: "team-2",
            name: "Tag Machines",
            abbreviation: "TAG",
          },
        };
      },
    },
    rosterAssignment: {
      async findFirst() {
        return {
          id: "assignment-9",
          acquisitionType: "AUCTION",
          rosterStatus: "ACTIVE",
          hostPlatformReferenceId: "host-tagged",
          effectiveAt: new Date("2026-03-01T00:00:00.000Z"),
          team: {
            id: "team-2",
            name: "Tag Machines",
            abbreviation: "TAG",
          },
        };
      },
    },
    contract: {
      async findMany() {
        return [
          {
            id: "contract-tagged",
            teamId: "team-2",
            salary: 24,
            yearsTotal: 1,
            yearsRemaining: 1,
            startYear: 2026,
            endYear: 2026,
            isRookieContract: false,
            rookieOptionEligible: false,
            rookieOptionExercised: false,
            isFranchiseTag: true,
            status: "TAGGED",
            endedAt: null,
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-02T00:00:00.000Z"),
            team: {
              id: "team-2",
              name: "Tag Machines",
              abbreviation: "TAG",
            },
            seasonLedgers: [
              {
                annualSalary: 24,
                yearsRemainingAtStart: 1,
                ledgerStatus: "TAGGED",
              },
            ],
            franchiseTagUsages: [
              {
                id: "tag-1",
                finalTagSalary: 24,
                priorSalary: 20,
              },
            ],
            optionDecisions: [],
            deadCapCharges: [
              {
                id: "dead-cap-tagged",
                sourceEventType: "CUT",
                systemCalculatedAmount: 8,
                adjustedAmount: null,
                isOverride: false,
                overrideReason: null,
                createdAt: new Date("2026-03-03T00:00:00.000Z"),
                appliesToSeason: {
                  year: 2027,
                },
              },
            ],
          },
        ];
      },
    },
    complianceIssue: {
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
    leagueId: "league-1",
    playerId: "player-9",
    now: new Date("2026-03-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.contract?.status, "TAGGED");
  assert.equal(result.contract?.isFranchiseTag, true);
  assert.equal(result.contract?.franchiseTagUsage?.finalTagSalary, 24);
  assert.equal(result.contract?.deadCapSchedule[0]?.effectiveAmount, 8);
});

test("player contract detail projection remains safe when a season is active but no contract exists", async () => {
  const projection = createPlayerContractDetailProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: "Primary league",
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "REGULAR_SEASON",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    player: {
      async findUnique() {
        return {
          id: "player-3",
          name: "Unsigned TE",
          position: "TE",
          nflTeam: null,
          age: 25,
          yearsPro: 3,
          injuryStatus: null,
          isRestricted: false,
        };
      },
    },
    rosterSlot: {
      async findFirst() {
        return null;
      },
    },
    rosterAssignment: {
      async findFirst() {
        return null;
      },
    },
    contract: {
      async findMany() {
        return [];
      },
    },
    complianceIssue: {
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
    leagueId: "league-1",
    playerId: "player-3",
    now: new Date("2026-09-10T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "active");
  assert.notEqual(result.season, null);
  assert.equal(result.contract, null);
  assert.equal(result.rosterContext, null);
  assert.equal(result.availability.seasonResolved, true);
  assert.equal(result.availability.currentSeasonContractAvailable, false);
});
