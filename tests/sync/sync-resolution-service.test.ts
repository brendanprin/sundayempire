import assert from "node:assert/strict";
import test from "node:test";
import { createSyncResolutionService } from "@/lib/domain/sync/sync-resolution-service";

function createResolveHarness() {
  const assignment = {
    id: "assignment-1",
    hostPlatformReferenceId: null as string | null,
  };

  const mismatch = {
    id: "mismatch-1",
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    playerId: "player-1",
    rosterAssignmentId: "assignment-1",
    complianceIssueId: null as string | null,
    mismatchType: "ROSTER_STATUS_DIFFERENCE",
    severity: "WARNING",
    status: "OPEN",
    resolutionType: null as string | null,
    title: "Roster status differs from host platform",
    message: "Host snapshot says the player is on IR.",
    fingerprint: "fp-1",
    hostPlatformReferenceId: "host-sync-ref-1",
    hostValueJson: {
      rosterStatus: "IR",
    },
    dynastyValueJson: {
      rosterStatus: "ACTIVE",
    },
    metadataJson: {
      reason: "status_difference",
    },
  };

  const transactionLogs: Array<Record<string, unknown>> = [];

  const client = {
    syncMismatch: {
      async findUnique() {
        return mismatch;
      },
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(mismatch, args.data);
        return mismatch;
      },
    },
    rosterAssignment: {
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(assignment, args.data);
        return assignment;
      },
    },
    transaction: {
      async create(args: { data: Record<string, unknown> }) {
        transactionLogs.push(args.data);
        return args.data;
      },
    },
  };

  return {
    client,
    mismatch,
    assignment,
    transactionLogs,
  };
}

function createEscalationHarness() {
  const mismatch = {
    id: "mismatch-2",
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    playerId: "player-1",
    rosterAssignmentId: "assignment-1",
    complianceIssueId: null as string | null,
    mismatchType: "ROSTER_TEAM_DIFFERENCE",
    severity: "HIGH_IMPACT",
    status: "OPEN",
    resolutionType: null as string | null,
    title: "Roster team differs from host platform",
    message: "Host snapshot assigns the player to a different team.",
    fingerprint: "fp-escalate",
    hostPlatformReferenceId: "host-sync-ref-2",
    hostValueJson: {
      teamName: "Bench Mob",
    },
    dynastyValueJson: {
      teamName: "Cap Casualties",
    },
    metadataJson: {
      reason: "team_difference",
    },
  };

  const createdIssues: Array<Record<string, unknown>> = [];
  const createdActions: Array<Record<string, unknown>> = [];
  const notificationCalls: Array<{ data: Array<Record<string, unknown>> }> = [];
  const transactionLogs: Array<Record<string, unknown>> = [];

  const client = {
    syncMismatch: {
      async findUnique() {
        return mismatch;
      },
      async update(args: { data: Record<string, unknown> }) {
        Object.assign(mismatch, args.data);
        return mismatch;
      },
    },
    rosterAssignment: {
      async update() {
        throw new Error("roster assignment should not update during escalation");
      },
    },
    season: {
      async findFirst() {
        return {
          id: "season-1",
          phase: "OFFSEASON_ROLLOVER",
        };
      },
    },
    leagueDeadline: {
      async findFirst() {
        return null;
      },
    },
    complianceIssue: {
      async create(args: { data: Record<string, unknown> }) {
        const created = {
          id: "issue-1",
          title: String(args.data.title),
          message: String(args.data.message),
          fingerprint: String(args.data.fingerprint),
          ...args.data,
        };
        createdIssues.push(created);
        return created;
      },
      async update() {
        throw new Error("createSyncIssue should not update compliance issue status on create");
      },
    },
    complianceAction: {
      async create(args: { data: Record<string, unknown> }) {
        const created = {
          id: "action-1",
          ...args.data,
        };
        createdActions.push(created);
        return created;
      },
    },
    leagueMembership: {
      async findMany() {
        return [
          {
            userId: "commissioner-user",
          },
        ];
      },
    },
    teamMembership: {
      async findMany() {
        return [
          {
            userId: "team-owner-user",
          },
        ];
      },
    },
    notification: {
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        notificationCalls.push(args);
        return {
          count: args.data.length,
        };
      },
    },
    transaction: {
      async create(args: { data: Record<string, unknown> }) {
        transactionLogs.push(args.data);
        return args.data;
      },
    },
  };

  return {
    client,
    mismatch,
    createdIssues,
    createdActions,
    notificationCalls,
    transactionLogs,
  };
}

test("sync resolution accepts host snapshot conservatively by attaching host reference", async () => {
  const harness = createResolveHarness();
  const service = createSyncResolutionService(harness.client as never);

  const resolved = await service.resolve({
    mismatchId: "mismatch-1",
    resolutionType: "ACCEPT_HOST_PLATFORM",
    resolutionReason: "Reviewed host export.",
    actorUserId: "commissioner-user",
    actor: {
      email: "commissioner@local.league",
      role: "COMMISSIONER",
      teamId: null,
    },
  });

  assert.equal(harness.assignment.hostPlatformReferenceId, "host-sync-ref-1");
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.resolutionType, "ACCEPT_HOST_PLATFORM");
  assert.equal(harness.transactionLogs.length, 1);
});

test("sync escalation creates a compliance issue for high-impact mismatches", async () => {
  const harness = createEscalationHarness();
  const service = createSyncResolutionService(harness.client as never);

  const result = await service.escalateToCompliance({
    mismatchId: "mismatch-2",
    reason: "Ownership drift affects legality.",
    actorUserId: "commissioner-user",
    actorRoleSnapshot: "COMMISSIONER",
    actor: {
      email: "commissioner@local.league",
      role: "COMMISSIONER",
      teamId: null,
    },
  });

  assert.equal(result.complianceIssueId, "issue-1");
  assert.equal(harness.mismatch.status, "ESCALATED");
  assert.equal(harness.mismatch.resolutionType, "ESCALATE_TO_COMPLIANCE");
  assert.equal(harness.createdIssues.length, 1);
  assert.equal(harness.createdIssues[0]?.source, "SYNC");
  assert.equal(harness.createdIssues[0]?.issueType, "SYNC");
  assert.equal(harness.createdActions.length, 1);
  assert.equal(harness.notificationCalls.length, 1);
  assert.equal(harness.transactionLogs.length, 1);
});
