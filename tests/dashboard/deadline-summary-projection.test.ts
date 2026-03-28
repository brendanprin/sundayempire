import assert from "node:assert/strict";
import test from "node:test";
import { createDeadlineSummaryProjection } from "@/lib/read-models/dashboard/deadline-summary-projection";

test("deadline summary projection orders current and upcoming deadlines deterministically", async () => {
  const projection = createDeadlineSummaryProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Deadline League",
          description: null,
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "TAG_OPTION_COMPLIANCE",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    leagueDeadline: {
      async findMany() {
        return [
          {
            id: "deadline-overdue",
            phase: "TAG_OPTION_COMPLIANCE",
            deadlineType: "OPTION_LOCK",
            scheduledAt: new Date("2026-04-10T00:00:00.000Z"),
            sourceType: "ruleset",
            reminderOffsetsJson: [7, 1],
          },
          {
            id: "deadline-soon",
            phase: "TAG_OPTION_COMPLIANCE",
            deadlineType: "TAG_LOCK",
            scheduledAt: new Date("2026-04-18T00:00:00.000Z"),
            sourceType: "ruleset",
            reminderOffsetsJson: [3, 1],
          },
          {
            id: "deadline-future",
            phase: "ROOKIE_DRAFT",
            deadlineType: "ROOKIE_DRAFT_START",
            scheduledAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceType: "ruleset",
            reminderOffsetsJson: [7],
          },
        ];
      },
    },
    complianceIssue: {
      async findMany() {
        return [
          { leagueDeadlineId: "deadline-overdue" },
          { leagueDeadlineId: "deadline-overdue" },
          { leagueDeadlineId: "deadline-soon" },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    limit: 2,
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "active");
  assert.equal(result.season?.currentPhase, "TAG_OPTION_COMPLIANCE");
  assert.equal(result.summary.totalDeadlines, 3);
  assert.equal(result.summary.currentPhaseCount, 2);
  assert.equal(result.summary.overdueCount, 1);
  assert.equal(result.currentPhaseDeadlines[0]?.id, "deadline-overdue");
  assert.equal(result.currentPhaseDeadlines[1]?.id, "deadline-soon");
  assert.equal(result.upcomingDeadlines.length, 2);
  assert.equal(result.upcomingDeadlines[0]?.id, "deadline-overdue");
  assert.equal(result.upcomingDeadlines[0]?.openIssueCount, 2);
  assert.equal(result.upcomingDeadlines[1]?.id, "deadline-soon");
  assert.equal(result.upcomingDeadlines[1]?.urgency, "soon");
});

test("deadline summary projection is empty-state safe when active season is unresolved", async () => {
  const projection = createDeadlineSummaryProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Empty Deadline League",
          description: null,
          seasons: [],
        };
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    now: new Date("2026-04-15T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.seasonSelection, "unresolved");
  assert.equal(result.season, null);
  assert.deepEqual(result.currentPhaseDeadlines, []);
  assert.deepEqual(result.upcomingDeadlines, []);
  assert.equal(result.summary.totalDeadlines, 0);
});
