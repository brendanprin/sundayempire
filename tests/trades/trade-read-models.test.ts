import assert from "node:assert/strict";
import test from "node:test";
import { createTradeProposalDetailProjection } from "@/lib/read-models/trades/trade-proposal-detail-projection";
import { createTradesHomeProjection } from "@/lib/read-models/trades/trades-home-projection";

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
    status: "SUBMITTED",
    submittedAt: new Date("2026-04-04T10:00:00.000Z"),
    counterpartyRespondedAt: null,
    reviewedAt: null,
    createdAt: new Date("2026-04-04T09:00:00.000Z"),
    updatedAt: new Date("2026-04-04T10:00:00.000Z"),
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
    ],
    evaluations: [
      {
        id: "evaluation-1",
        proposalId: "proposal-1",
        leagueId: "league-1",
        seasonId: "season-1",
        createdByUserId: "user-1",
        trigger: "SUBMIT",
        outcome: "PASS",
        isCurrent: true,
        isSubmissionSnapshot: true,
        assetFingerprint: "fp-1",
        findingsJson: [],
        remediationJson: null,
        postTradeProjectionJson: {
          available: false,
          teamA: null,
          teamB: null,
        },
        evaluatedAt: new Date("2026-04-04T10:00:00.000Z"),
        createdAt: new Date("2026-04-04T10:00:00.000Z"),
        createdByUser: { id: "user-1", email: "owner1@example.com", name: "Owner 1" },
      },
    ],
    ...overrides,
  };
}

test("trades home projection groups proposal sections for members", async () => {
  const home = await createTradesHomeProjection({
    tradeProposal: {
      async findMany() {
        return [
          buildProposalRecord({
            id: "draft-1",
            status: "DRAFT",
            updatedAt: new Date("2026-04-04T09:00:00.000Z"),
            submittedAt: null,
          }),
          buildProposalRecord({
            id: "incoming-1",
            proposerTeamId: "team-2",
            counterpartyTeamId: "team-1",
            proposerTeam: { id: "team-2", name: "Bench Mob", abbreviation: "BEN" },
            counterpartyTeam: { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
            updatedAt: new Date("2026-04-04T11:00:00.000Z"),
          }),
          buildProposalRecord({
            id: "review-1",
            status: "REVIEW_PENDING",
            updatedAt: new Date("2026-04-04T12:00:00.000Z"),
          }),
          buildProposalRecord({
            id: "closed-1",
            status: "DECLINED",
            updatedAt: new Date("2026-04-04T13:00:00.000Z"),
          }),
        ];
      },
    },
  } as never).read({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    seasonPhase: "REGULAR_SEASON",
    leagueName: "Dynasty League",
    actor: {
      userId: "user-1",
      email: "owner1@example.com",
      name: "Owner 1",
      leagueRole: "MEMBER",
      teamId: "team-1",
      teamName: "Cap Casualties",
      leagueId: "league-1",
    },
  });

  assert.equal(home.sections.drafts.length, 1);
  assert.equal(home.sections.requiresResponse.length, 1);
  assert.equal(home.sections.reviewQueue.length, 1);
  assert.equal(home.sections.closed.length, 1);
  assert.equal(home.summary.settlementQueue, 0);
});

test("trade proposal detail projection exposes commissioner review permissions", async () => {
  const detail = await createTradeProposalDetailProjection({
    tradeProposal: {
      async findUnique() {
        return buildProposalRecord({
          status: "REVIEW_PENDING",
          evaluations: [
            {
              ...buildProposalRecord().evaluations[0],
              outcome: "FAIL_REQUIRES_COMMISSIONER",
            },
          ],
        });
      },
    },
  } as never).read({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    seasonPhase: "REGULAR_SEASON",
    leagueName: "Dynasty League",
    actor: {
      userId: "user-comm",
      email: "commissioner@example.com",
      name: "Commissioner",
      leagueRole: "COMMISSIONER",
      teamId: null,
      teamName: null,
      leagueId: "league-1",
    },
    proposalId: "proposal-1",
  });

  assert.ok(detail);
  assert.equal(detail?.permissions.canCommissionerReview, true);
  assert.equal(detail?.permissions.canProcess, false);
  assert.equal(detail?.currentEvaluation?.outcome, "FAIL_REQUIRES_COMMISSIONER");
});

test("trades home projection exposes commissioner settlement queue separately from closed history", async () => {
  const home = await createTradesHomeProjection({
    tradeProposal: {
      async findMany() {
        return [
          buildProposalRecord({
            id: "submitted-1",
            status: "SUBMITTED",
            updatedAt: new Date("2026-04-04T10:00:00.000Z"),
          }),
          buildProposalRecord({
            id: "accepted-1",
            status: "ACCEPTED",
            updatedAt: new Date("2026-04-04T11:00:00.000Z"),
          }),
          buildProposalRecord({
            id: "review-approved-1",
            status: "REVIEW_APPROVED",
            updatedAt: new Date("2026-04-04T12:00:00.000Z"),
          }),
          buildProposalRecord({
            id: "processed-1",
            status: "PROCESSED",
            updatedAt: new Date("2026-04-04T13:00:00.000Z"),
          }),
        ];
      },
    },
  } as never).read({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    seasonPhase: "REGULAR_SEASON",
    leagueName: "Dynasty League",
    actor: {
      userId: "user-comm",
      email: "commissioner@example.com",
      name: "Commissioner",
      leagueRole: "COMMISSIONER",
      teamId: null,
      teamName: null,
      leagueId: "league-1",
    },
  });

  assert.equal(home.summary.reviewQueue, 0);
  assert.equal(home.summary.settlementQueue, 2);
  assert.equal(home.sections.settlementQueue.length, 2);
  assert.equal(home.sections.closed.length, 1);
  assert.equal(home.sections.closed[0]?.status, "PROCESSED");
});

test("trade proposal detail projection exposes commissioner settlement permission", async () => {
  const detail = await createTradeProposalDetailProjection({
    tradeProposal: {
      async findUnique() {
        return buildProposalRecord({
          status: "REVIEW_APPROVED",
          reviewedAt: new Date("2026-04-04T12:00:00.000Z"),
        });
      },
    },
  } as never).read({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    seasonPhase: "REGULAR_SEASON",
    leagueName: "Dynasty League",
    actor: {
      userId: "user-comm",
      email: "commissioner@example.com",
      name: "Commissioner",
      leagueRole: "COMMISSIONER",
      teamId: null,
      teamName: null,
      leagueId: "league-1",
    },
    proposalId: "proposal-1",
  });

  assert.ok(detail);
  assert.equal(detail?.permissions.canCommissionerReview, false);
  assert.equal(detail?.permissions.canProcess, true);
});
