import assert from "node:assert/strict";
import test from "node:test";
import { createTradeProposalWorkflowService } from "@/lib/domain/trades/trade-proposal-service";
import type { AuthActor } from "@/lib/auth";

function buildProposalRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proposal-1",
    leagueId: "league-1",
    seasonId: "season-1",
    proposerTeamId: "team-1",
    counterpartyTeamId: "team-2",
    createdByUserId: "user-1",
    submittedByUserId: null,
    counterpartyRespondedByUserId: null,
    reviewedByUserId: null,
    status: "DRAFT",
    submittedAt: null,
    counterpartyRespondedAt: null,
    reviewedAt: null,
    createdAt: new Date("2026-04-04T09:00:00.000Z"),
    updatedAt: new Date("2026-04-04T09:00:00.000Z"),
    createdByUser: { id: "user-1", email: "owner1@example.com", name: "Owner 1" },
    submittedByUser: null,
    respondedByUser: null,
    reviewedByUser: null,
    proposerTeam: { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
    counterpartyTeam: { id: "team-2", name: "Bench Mob", abbreviation: "BEN" },
    assets: [
      {
        id: "asset-1",
        assetOrder: 0,
        assetType: "PLAYER",
        fromTeamId: "team-1",
        toTeamId: "team-2",
        playerId: "player-1",
        futurePickId: null,
        contractId: "contract-1",
        snapshotLabel: "Alpha QB (QB)",
        player: {
          id: "player-1",
          name: "Alpha QB",
          position: "QB",
          isRestricted: false,
        },
        futurePick: null,
        contract: {
          id: "contract-1",
          salary: 10,
          yearsRemaining: 2,
          status: "ACTIVE",
          isFranchiseTag: false,
        },
      },
      {
        id: "asset-2",
        assetOrder: 1,
        assetType: "PLAYER",
        fromTeamId: "team-2",
        toTeamId: "team-1",
        playerId: "player-2",
        futurePickId: null,
        contractId: "contract-2",
        snapshotLabel: "Bravo WR (WR)",
        player: {
          id: "player-2",
          name: "Bravo WR",
          position: "WR",
          isRestricted: false,
        },
        futurePick: null,
        contract: {
          id: "contract-2",
          salary: 11,
          yearsRemaining: 1,
          status: "ACTIVE",
          isFranchiseTag: false,
        },
      },
    ],
    evaluations: [],
    ...overrides,
  };
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function createWorkflowTestHarness(initialProposal: ReturnType<typeof buildProposalRecord>) {
  let proposal = buildProposalRecord(cloneValue(initialProposal));
  let evaluations: Array<Record<string, unknown>> = [];
  let evaluationCounter = 1;
  const recordedOverrides: Array<Record<string, unknown>> = [];
  const notifiedOverrides: Array<Record<string, unknown>> = [];

  const hydrateProposal = () => ({
    ...proposal,
    proposerTeam: { ...proposal.proposerTeam },
    counterpartyTeam: { ...proposal.counterpartyTeam },
    createdByUser: proposal.createdByUser ? { ...proposal.createdByUser } : null,
    submittedByUser: proposal.submittedByUser ? { ...proposal.submittedByUser } : null,
    respondedByUser: proposal.respondedByUser ? { ...proposal.respondedByUser } : null,
    reviewedByUser: proposal.reviewedByUser ? { ...proposal.reviewedByUser } : null,
    assets: proposal.assets.map((asset) => ({
      ...asset,
      player: asset.player ? { ...asset.player } : null,
      futurePick: asset.futurePick ? cloneJson(asset.futurePick) : null,
      contract: asset.contract ? { ...asset.contract } : null,
    })),
    evaluations: evaluations.map((evaluation) => cloneValue(evaluation)),
  });

  const client = {
    async $transaction<T>(callback: (tx: typeof client) => Promise<T>) {
      return callback(client);
    },
    tradeProposal: {
      async findUnique() {
        return hydrateProposal();
      },
      async update(args: { data: Record<string, unknown> }) {
        proposal = {
          ...proposal,
          ...args.data,
          updatedAt: new Date(proposal.updatedAt.getTime() + 60_000),
        };
        return hydrateProposal();
      },
    },
    tradeEvaluation: {
      async updateMany() {
        evaluations = evaluations.map((evaluation) => ({
          ...evaluation,
          isCurrent: false,
        }));
        return { count: evaluations.length };
      },
      async create(args: { data: Record<string, unknown> }) {
        const evaluation = {
          id: `evaluation-${evaluationCounter++}`,
          createdAt: new Date("2026-04-04T10:00:00.000Z"),
          evaluatedAt: new Date("2026-04-04T10:00:00.000Z"),
          createdByUser:
            args.data.createdByUserId === null
              ? null
              : {
                  id: args.data.createdByUserId,
                  email: "actor@example.com",
                  name: "Actor",
                },
          ...args.data,
        };
        evaluations = [evaluation, ...evaluations];
        return cloneValue(evaluation);
      },
      async findFirst() {
        return evaluations.find((evaluation) => evaluation.isCurrent) ?? null;
      },
      async findMany() {
        return evaluations.map((evaluation) => cloneValue(evaluation));
      },
    },
  };

  return {
    client,
    recordedOverrides,
    notifiedOverrides,
    getProposal() {
      return proposal;
    },
    getEvaluations() {
      return evaluations;
    },
    createOverrideFactory() {
      return () => ({
        async recordOverride(input: Record<string, unknown>) {
          recordedOverrides.push(input);
          return { id: "override-1" };
        },
        async notifyRecordedOverride(input: Record<string, unknown>) {
          notifiedOverrides.push(input);
          throw new Error("override fan-out failed");
        },
      });
    },
  };
}

function createEvaluation(trigger: "SUBMIT" | "COUNTERPARTY_RESPONSE" | "COMMISSIONER_REVIEW") {
  return {
    trigger,
    outcome:
      trigger === "COMMISSIONER_REVIEW" ? "FAIL_REQUIRES_COMMISSIONER" : "PASS",
    assetFingerprint: `fp-${trigger.toLowerCase()}`,
    findings: [],
    remediation: null,
    postTradeProjection: {
      available: false,
      teamA: null,
      teamB: null,
    },
  };
}

const ownerActor: AuthActor = {
  userId: "user-1",
  email: "owner1@example.com",
  name: "Owner 1",
  accountRole: "USER",
  leagueRole: "MEMBER",
  teamId: "team-1",
  teamName: "Cap Casualties",
  leagueId: "league-1",
};

const counterpartyActor: AuthActor = {
  userId: "user-2",
  email: "owner2@example.com",
  name: "Owner 2",
  accountRole: "USER",
  leagueRole: "MEMBER",
  teamId: "team-2",
  teamName: "Bench Mob",
  leagueId: "league-1",
};

const commissionerActor: AuthActor = {
  userId: "comm-1",
  email: "commissioner@example.com",
  name: "Commissioner",
  accountRole: "USER",
  leagueRole: "COMMISSIONER",
  teamId: null,
  teamName: null,
  leagueId: "league-1",
};

function createFailingNotificationService() {
  return {
    async notifyCounterpartySubmission() {
      throw new Error("submission fan-out failed");
    },
    async notifyCommissionerReview() {
      throw new Error("review queue fan-out failed");
    },
    async notifyProposalDecision() {
      throw new Error("proposal decision fan-out failed");
    },
  };
}

test("submit returns success when post-commit notification fan-out fails", async () => {
  const harness = createWorkflowTestHarness(buildProposalRecord());
  const service = createTradeProposalWorkflowService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return createEvaluation(input.trigger);
      },
    },
    notificationService: createFailingNotificationService(),
  });

  const result = await service.submit({
    actor: ownerActor,
    proposalId: "proposal-1",
  });

  assert.equal(result.status, "SUBMITTED");
  assert.equal(harness.getProposal().status, "SUBMITTED");
  assert.equal(harness.getEvaluations().length, 1);
  assert.equal(harness.getEvaluations()[0]?.trigger, "SUBMIT");
});

test("accept returns success when post-commit notification fan-out fails", async () => {
  const harness = createWorkflowTestHarness(
    buildProposalRecord({
      status: "SUBMITTED",
      submittedAt: new Date("2026-04-04T10:00:00.000Z"),
    }),
  );
  const service = createTradeProposalWorkflowService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return createEvaluation(input.trigger);
      },
    },
    notificationService: createFailingNotificationService(),
  });

  const result = await service.accept({
    actor: counterpartyActor,
    proposalId: "proposal-1",
  });

  assert.equal(result.status, "ACCEPTED");
  assert.equal(harness.getProposal().status, "ACCEPTED");
  assert.equal(harness.getEvaluations().length, 1);
  assert.equal(harness.getEvaluations()[0]?.trigger, "COUNTERPARTY_RESPONSE");
});

test("decline returns success when post-commit notification fan-out fails", async () => {
  const harness = createWorkflowTestHarness(
    buildProposalRecord({
      status: "SUBMITTED",
      submittedAt: new Date("2026-04-04T10:00:00.000Z"),
    }),
  );
  const service = createTradeProposalWorkflowService(harness.client as never, {
    notificationService: createFailingNotificationService(),
  });

  const result = await service.decline({
    actor: counterpartyActor,
    proposalId: "proposal-1",
  });

  assert.equal(result.status, "DECLINED");
  assert.equal(harness.getProposal().status, "DECLINED");
});

test("review returns success when override and proposal fan-out fail after commit", async () => {
  const harness = createWorkflowTestHarness(
    buildProposalRecord({
      status: "REVIEW_PENDING",
      submittedAt: new Date("2026-04-04T10:00:00.000Z"),
    }),
  );
  const service = createTradeProposalWorkflowService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return createEvaluation(input.trigger);
      },
    },
    notificationService: createFailingNotificationService(),
    commissionerOverrideFactory: harness.createOverrideFactory() as never,
  });

  const result = await service.review({
    actor: commissionerActor,
    proposalId: "proposal-1",
    decision: "approve",
    reason: "Flagged package approved after review.",
  });

  assert.equal(result.status, "REVIEW_APPROVED");
  assert.equal(harness.getProposal().status, "REVIEW_APPROVED");
  assert.equal(harness.getEvaluations().length, 1);
  assert.equal(harness.getEvaluations()[0]?.trigger, "COMMISSIONER_REVIEW");
  assert.equal(harness.recordedOverrides.length, 1);
  assert.equal(harness.notifiedOverrides.length, 1);
});
