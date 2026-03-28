import assert from "node:assert/strict";
import test from "node:test";
import { createRulesDeadlinesProjection } from "@/lib/read-models/rules/rules-deadlines-projection";

test("rules deadlines projection combines active ruleset, lifecycle, and deadline summary", async () => {
  const projection = createRulesDeadlinesProjection({
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
    leagueRuleSet: {
      async findMany() {
        return [
          {
            id: "rules-2",
            leagueId: "league-1",
            isActive: true,
            version: 2,
            effectiveAt: new Date("2026-03-01T00:00:00.000Z"),
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-01T00:00:00.000Z"),
            notes: "Updated rookie option rules",
            rosterSize: 17,
            starterQb: 1,
            starterQbFlex: 1,
            starterRb: 2,
            starterWr: 3,
            starterTe: 1,
            starterFlex: 1,
            starterDst: 1,
            irSlots: 2,
            salaryCapSoft: 245,
            salaryCapHard: 300,
            waiverBidMaxAtOrAboveSoftCap: 0,
            minContractYears: 1,
            maxContractYears: 4,
            minSalary: 1,
            maxContractYearsIfSalaryBelowTen: 3,
            rookieBaseYears: 1,
            rookieOptionYears: 2,
            franchiseTagsPerTeam: 1,
            tradeDeadlineWeek: 11,
            regularSeasonWeeks: 13,
            playoffStartWeek: 14,
            playoffEndWeek: 16,
          },
          {
            id: "rules-1",
            leagueId: "league-1",
            isActive: false,
            version: 1,
            effectiveAt: new Date("2025-01-01T00:00:00.000Z"),
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
            updatedAt: new Date("2025-01-01T00:00:00.000Z"),
            notes: "Initial rules",
            rosterSize: 17,
            starterQb: 1,
            starterQbFlex: 1,
            starterRb: 2,
            starterWr: 3,
            starterTe: 1,
            starterFlex: 1,
            starterDst: 1,
            irSlots: 2,
            salaryCapSoft: 240,
            salaryCapHard: 295,
            waiverBidMaxAtOrAboveSoftCap: 0,
            minContractYears: 1,
            maxContractYears: 4,
            minSalary: 1,
            maxContractYearsIfSalaryBelowTen: 3,
            rookieBaseYears: 1,
            rookieOptionYears: 2,
            franchiseTagsPerTeam: 1,
            tradeDeadlineWeek: 11,
            regularSeasonWeeks: 13,
            playoffStartWeek: 14,
            playoffEndWeek: 16,
          },
        ];
      },
    },
    leagueDeadline: {
      async findMany() {
        return [
          {
            id: "deadline-1",
            phase: "TAG_OPTION_COMPLIANCE",
            deadlineType: "OPTION_LOCK",
            scheduledAt: new Date("2026-04-20T00:00:00.000Z"),
            sourceType: "ruleset",
            reminderOffsetsJson: [7, 1],
          },
          {
            id: "deadline-2",
            phase: "ROOKIE_DRAFT",
            deadlineType: "ROOKIE_DRAFT_START",
            scheduledAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceType: "ruleset",
            reminderOffsetsJson: [3],
          },
        ];
      },
    },
    complianceIssue: {
      async findMany() {
        return [
          {
            leagueDeadlineId: "deadline-1",
          },
        ];
      },
    },
    leaguePhaseTransition: {
      async findMany() {
        return [
          {
            id: "transition-1",
            fromPhase: "OFFSEASON_ROLLOVER",
            toPhase: "TAG_OPTION_COMPLIANCE",
            transitionStatus: "SUCCESS",
            occurredAt: new Date("2026-03-01T00:00:00.000Z"),
            reason: "Opened tag window",
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    now: new Date("2026-04-15T00:00:00.000Z"),
    deadlineLimit: 2,
  });

  assert.ok(result);
  assert.equal(result.league.name, "Dynasty League");
  assert.equal(result.seasonSelection, "active");
  assert.equal(result.ruleset?.version, 2);
  assert.equal(result.history.length, 2);
  assert.equal(result.deadlines.summary.totalDeadlines, 2);
  assert.equal(result.deadlines.currentPhaseDeadlines[0]?.id, "deadline-1");
  assert.equal(result.lifecycle.currentPhase, "TAG_OPTION_COMPLIANCE");
  assert.equal(result.lifecycle.legacyPhase, "OFFSEASON");
  assert.equal(result.lifecycle.nextPhase, null);
  assert.equal(result.lifecycle.blockers.length, 0);
  assert.equal(result.lifecycle.recentTransitions[0]?.id, "transition-1");
  assert.equal(result.availability.rulesetAvailable, true);
  assert.equal(result.availability.seasonResolved, true);
});

test("rules deadlines projection stays empty-state safe when season or ruleset context is missing", async () => {
  const projection = createRulesDeadlinesProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Sparse League",
          description: null,
          seasons: [],
        };
      },
    },
    leagueRuleSet: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    now: new Date("2026-01-10T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "unresolved");
  assert.equal(result.season, null);
  assert.equal(result.ruleset, null);
  assert.deepEqual(result.history, []);
  assert.equal(result.deadlines.summary.totalDeadlines, 0);
  assert.equal(result.lifecycle.currentPhase, null);
  assert.deepEqual(result.lifecycle.blockers, []);
  assert.equal(result.availability.rulesetAvailable, false);
  assert.equal(result.availability.seasonResolved, false);
});
