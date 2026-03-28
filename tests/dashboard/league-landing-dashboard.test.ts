import assert from "node:assert/strict";
import test from "node:test";
import { createLeagueLandingDashboardService } from "@/lib/application/dashboard/get-league-landing-dashboard";

test("league landing dashboard composes team, deadline, picks, activity, notifications, and canonical trade proposal summaries", async () => {
  const service = createLeagueLandingDashboardService({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: "Test league",
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "REGULAR_SEASON",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async count() {
        return 12;
      },
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
    leagueMembership: {
      async count() {
        return 4;
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
          openedAt: null,
          closedAt: null,
        };
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return {
          version: 2,
          isActive: true,
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
          activeCapTotal: 200,
          deadCapTotal: 5,
          hardCapTotal: 205,
          lastRecalculatedAt: new Date("2026-04-04T00:00:00.000Z"),
        };
      },
    },
    complianceIssue: {
      async findMany(args: { where: { teamId?: string | null; leagueDeadlineId?: { not: null } } }) {
        if (args.where.leagueDeadlineId) {
          return [{ leagueDeadlineId: "deadline-1" }];
        }

        if (args.where.teamId) {
          return [
            {
              severity: "WARNING",
              dueAt: new Date("2026-04-08T00:00:00.000Z"),
              status: "OPEN",
            },
          ];
        }

        return [
          {
            severity: "WARNING",
            dueAt: new Date("2026-04-08T00:00:00.000Z"),
          },
        ];
      },
    },
    contract: {
      async findMany() {
        return [
          {
            id: "contract-1",
            status: "EXPIRING",
            rookieOptionEligible: false,
            rookieOptionExercised: false,
            optionDecisions: [],
          },
        ];
      },
    },
    leaguePhaseTransition: {
      async findFirst() {
        return {
          id: "transition-1",
          fromPhase: "PRESEASON_SETUP",
          toPhase: "REGULAR_SEASON",
          occurredAt: new Date("2026-04-01T00:00:00.000Z"),
          reason: "Season opened",
        };
      },
    },
    leagueDeadline: {
      async findMany() {
        return [
          {
            id: "deadline-1",
            phase: "REGULAR_SEASON",
            deadlineType: "TRADE_DEADLINE",
            scheduledAt: new Date("2026-04-05T00:00:00.000Z"),
            sourceType: "SYSTEM",
            reminderOffsetsJson: [72, 24],
          },
        ];
      },
    },
    futurePick: {
      async findMany() {
        return [
          {
            id: "pick-1",
            seasonYear: 2026,
            round: 1,
            overall: 4,
            originalTeam: { id: "orig-1", name: "Original One", abbreviation: "O1" },
          },
        ];
      },
    },
    transaction: {
      async findMany() {
        return [
          {
            id: "tx-1",
            type: "ROSTER_MOVE",
            summary: "Moved Player One to IR.",
            createdAt: new Date("2026-04-03T12:00:00.000Z"),
            team: { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
            player: { id: "player-1", name: "Player One", position: "WR" },
          },
        ];
      },
    },
    commissionerOverride: {
      async findFirst() {
        return {
          id: "override-1",
          overrideType: "MANUAL_RULING",
          reason: "Late paperwork accepted.",
          createdAt: new Date("2026-04-02T10:00:00.000Z"),
          team: { name: "Cap Casualties" },
          actorUser: { name: "Commissioner", email: "commissioner@example.com" },
        };
      },
    },
    notification: {
      async findMany() {
        return [
          {
            id: "note-1",
            eventType: "compliance.issue.created",
            title: "Cap warning",
            body: "Soft cap exceeded.",
            createdAt: new Date("2026-04-03T08:00:00.000Z"),
            readAt: null,
          },
        ];
      },
      async count() {
        return 2;
      },
    },
    tradeProposal: {
      async count(args: { where: { status: "SUBMITTED" | { in: ["ACCEPTED", "REVIEW_APPROVED"] }; proposerTeamId?: string; counterpartyTeamId?: string } }) {
        if (typeof args.where.status === "object") {
          return 1;
        }
        if (args.where.counterpartyTeamId) {
          return 2;
        }
        return 1;
      },
      async findFirst() {
        return {
          id: "proposal-1",
          status: "SUBMITTED",
          createdAt: new Date("2026-04-03T09:00:00.000Z"),
          updatedAt: new Date("2026-04-03T11:00:00.000Z"),
          proposerTeamId: "team-1",
          proposerTeam: { name: "Cap Casualties" },
          counterpartyTeam: { name: "Bench Mob" },
        };
      },
    },
    trade: {
      async count(args: { where: { status: "PROPOSED" | "APPROVED"; teamAId?: string; teamBId?: string } }) {
        return args.where.status === "PROPOSED" ? 7 : 5;
      },
      async findFirst() {
        return {
          id: "legacy-trade-1",
          status: "APPROVED",
          proposedAt: new Date("2026-04-04T09:00:00.000Z"),
          updatedAt: new Date("2026-04-04T12:00:00.000Z"),
          notes: "Legacy trade row should not drive canonical dashboard copy.",
          teamAId: "team-1",
          teamA: { name: "Cap Casualties" },
          teamB: { name: "Bench Mob" },
        };
      },
    },
  } as never);

  const result = await service.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actor: {
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      accountRole: "USER",
      leagueRole: "MEMBER",
      teamId: "team-1",
      teamName: "Cap Casualties",
      leagueId: "league-1",
    },
    now: new Date("2026-04-04T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.viewer.leagueRole, "MEMBER");
  assert.ok(result.teamDashboard);
  assert.ok(result.rookiePicksOwned);
  assert.equal(result.pendingTradeActions.incomingProposalsCount, 2);
  assert.equal(result.pendingTradeActions.outgoingProposalsCount, 1);
  assert.equal(result.pendingTradeActions.awaitingProcessingCount, 1);
  assert.equal(result.pendingTradeActions.latestProposal?.id, "proposal-1");
  assert.equal(result.notificationSummary.unreadCount, 2);
  assert.equal(result.activitySummary.recentActivity.length, 1);
  assert.ok(result.alerts.length >= 1);
  assert.equal(result.alerts[0]?.href, "/teams/team-1");
  assert.ok(result.alerts.some((alert) => alert.href === "/rules"));
  assert.ok(result.alerts.some((alert) => alert.href === "/trades"));
  assert.equal(result.setupChecklist.available, false);
  assert.equal(result.setupChecklist.totalItemCount, 0);
  assert.equal(result.setupChecklist.primaryAction, null);
});

test("league landing dashboard stays safe for commissioner without a team", async () => {
  const service = createLeagueLandingDashboardService({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: null,
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "PRESEASON_SETUP",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async count() {
        return 12;
      },
    },
    leagueMembership: {
      async count() {
        return 1;
      },
    },
    leagueRuleSet: {
      async findFirst() {
        return {
          version: 1,
          isActive: true,
        };
      },
    },
    complianceIssue: {
      async findMany() {
        return [];
      },
    },
    leaguePhaseTransition: {
      async findFirst() {
        return null;
      },
    },
    leagueDeadline: {
      async findMany() {
        return [];
      },
    },
    transaction: {
      async findMany() {
        return [];
      },
      async findFirst() {
        return null;
      },
    },
    draft: {
      async findFirst() {
        return null;
      },
    },
    draftOrderEntry: {
      async count() {
        return 0;
      },
    },
    commissionerOverride: {
      async findFirst() {
        return null;
      },
    },
    notification: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      },
    },
    trade: {
      async count() {
        return 0;
      },
      async findFirst() {
        return null;
      },
    },
  } as never);

  const result = await service.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actor: {
      userId: "user-1",
      email: "commissioner@example.com",
      name: "Commissioner",
      accountRole: "USER",
      leagueRole: "COMMISSIONER",
      teamId: null,
      teamName: null,
      leagueId: "league-1",
    },
    now: new Date("2026-04-04T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.teamDashboard, null);
  assert.equal(result.rookiePicksOwned, null);
  assert.equal(result.pendingTradeActions.available, false);
  assert.equal(result.setupChecklist.available, true);
  assert.equal(result.setupChecklist.totalItemCount, 5);
  assert.equal(result.setupChecklist.completedItemCount, 1);
  assert.equal(result.setupChecklist.primaryIncompleteItemId, "founder-team-status");
  assert.equal(result.setupChecklist.primaryAction?.id, "setup-founder-team-status");
  assert.equal(result.setupChecklist.items[0]?.status, "INCOMPLETE");
});
