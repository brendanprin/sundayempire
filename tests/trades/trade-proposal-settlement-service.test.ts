import assert from "node:assert/strict";
import test from "node:test";
import { createTradeProposalSettlementService } from "@/lib/domain/trades/trade-proposal-settlement-service";
import type { AuthActor } from "@/lib/auth";

function buildProposalRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proposal-1",
    leagueId: "league-1",
    seasonId: "season-1",
    proposerTeamId: "team-1",
    counterpartyTeamId: "team-2",
    createdByUserId: "user-1",
    submittedByUserId: "user-1",
    counterpartyRespondedByUserId: "user-2",
    reviewedByUserId: null,
    status: "ACCEPTED",
    submittedAt: new Date("2026-04-04T10:00:00.000Z"),
    counterpartyRespondedAt: new Date("2026-04-04T11:00:00.000Z"),
    reviewedAt: null,
    createdAt: new Date("2026-04-04T09:00:00.000Z"),
    updatedAt: new Date("2026-04-04T11:00:00.000Z"),
    createdByUser: { id: "user-1", email: "owner1@example.com", name: "Owner 1" },
    submittedByUser: { id: "user-1", email: "owner1@example.com", name: "Owner 1" },
    respondedByUser: { id: "user-2", email: "owner2@example.com", name: "Owner 2" },
    reviewedByUser: null,
    proposerTeam: { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
    counterpartyTeam: { id: "team-2", name: "Bench Mob", abbreviation: "BEN" },
    assets: [
      {
        id: "asset-player-1",
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
        id: "asset-pick-1",
        assetOrder: 1,
        assetType: "PICK",
        fromTeamId: "team-2",
        toTeamId: "team-1",
        playerId: null,
        futurePickId: "pick-1",
        contractId: null,
        snapshotLabel: "2027 R1 from Bench Mob",
        player: null,
        futurePick: {
          id: "pick-1",
          seasonYear: 2027,
          round: 1,
          overall: 4,
          originalTeam: {
            id: "team-2",
            name: "Bench Mob",
            abbreviation: "BEN",
          },
          currentTeam: {
            id: "team-2",
            name: "Bench Mob",
            abbreviation: "BEN",
          },
          isUsed: false,
        },
        contract: null,
      },
    ],
    evaluations: [],
    ...overrides,
  };
}

const commissionerActor: AuthActor = {
  userId: "comm-1",
  email: "commissioner@example.com",
  name: "Commissioner",
  role: "COMMISSIONER",
  teamId: null,
  teamName: null,
  leagueId: "league-1",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createSettlementHarness(initialProposal = buildProposalRecord()) {
  let proposal = clone(initialProposal);
  const transactions: Array<Record<string, unknown>> = [];
  const contracts = [
    {
      id: "contract-1",
      seasonId: "season-1",
      teamId: "team-1",
      playerId: "player-1",
    },
  ];
  const rosterSlots = [
    {
      seasonId: "season-1",
      teamId: "team-1",
      playerId: "player-1",
    },
  ];
  const futurePicks = [
    {
      id: "pick-1",
      leagueId: "league-1",
      currentTeamId: "team-2",
    },
  ];

  const client = {
    async $transaction<T>(callback: (tx: typeof client) => Promise<T>) {
      return callback(client);
    },
    tradeProposal: {
      async findUnique() {
        return clone(proposal);
      },
      async update(args: { data: Record<string, unknown> }) {
        proposal = {
          ...proposal,
          ...args.data,
          updatedAt: new Date("2026-04-04T12:00:00.000Z"),
        };
        return clone(proposal);
      },
    },
    contract: {
      async updateMany(args: {
        where: {
          id?: string;
          seasonId?: string;
          teamId?: string;
          playerId?: string;
        };
        data: { teamId: string };
      }) {
        let count = 0;
        for (const contract of contracts) {
          if (
            (args.where.id ? contract.id === args.where.id : true) &&
            (args.where.seasonId ? contract.seasonId === args.where.seasonId : true) &&
            (args.where.teamId ? contract.teamId === args.where.teamId : true) &&
            (args.where.playerId ? contract.playerId === args.where.playerId : true)
          ) {
            contract.teamId = args.data.teamId;
            count += 1;
          }
        }
        return { count };
      },
    },
    rosterSlot: {
      async updateMany(args: {
        where: {
          seasonId: string;
          teamId: string;
          playerId: string;
        };
        data: { teamId: string };
      }) {
        let count = 0;
        for (const slot of rosterSlots) {
          if (
            slot.seasonId === args.where.seasonId &&
            slot.teamId === args.where.teamId &&
            slot.playerId === args.where.playerId
          ) {
            slot.teamId = args.data.teamId;
            count += 1;
          }
        }
        return { count };
      },
    },
    futurePick: {
      async updateMany(args: {
        where: {
          id: string;
          leagueId: string;
          currentTeamId: string;
        };
        data: { currentTeamId: string };
      }) {
        let count = 0;
        for (const pick of futurePicks) {
          if (
            pick.id === args.where.id &&
            pick.leagueId === args.where.leagueId &&
            pick.currentTeamId === args.where.currentTeamId
          ) {
            pick.currentTeamId = args.data.currentTeamId;
            count += 1;
          }
        }
        return { count };
      },
    },
    transaction: {
      async create(args: { data: Record<string, unknown> }) {
        transactions.push(args.data);
        return clone(args.data);
      },
    },
  };

  return {
    client,
    transactions,
    getProposal() {
      return clone(proposal);
    },
    getContractTeamId() {
      return contracts[0]?.teamId ?? null;
    },
    getRosterTeamId() {
      return rosterSlots[0]?.teamId ?? null;
    },
    getPickTeamId() {
      return futurePicks[0]?.currentTeamId ?? null;
    },
  };
}

test("settlement processes accepted proposal assets and records audit-linked transactions", async () => {
  const harness = createSettlementHarness();
  const service = createTradeProposalSettlementService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return {
          trigger: input.trigger,
          outcome: "PASS",
          assetFingerprint: "fp-settle",
          findings: [],
          remediation: null,
          postTradeProjection: {
            available: false,
            teamA: null,
            teamB: null,
          },
        };
      },
    },
  });

  const result = await service.settle({
    actor: commissionerActor,
    proposalId: "proposal-1",
  });

  assert.equal(result.status, "PROCESSED");
  assert.equal(harness.getProposal().status, "PROCESSED");
  assert.equal(harness.getContractTeamId(), "team-2");
  assert.equal(harness.getRosterTeamId(), "team-2");
  assert.equal(harness.getPickTeamId(), "team-1");
  assert.equal(harness.transactions.length, 4);

  const summary = harness.transactions.find(
    (entry) => entry.type === "COMMISSIONER_OVERRIDE",
  );
  assert.ok(summary);
  const metadata = summary?.metadata as {
    schemaVersion: number;
    entities?: {
      tradeProposalId?: string;
      tradeId?: string;
    };
    before?: {
      status?: string;
    };
    after?: {
      status?: string;
    };
  };
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.entities?.tradeProposalId, "proposal-1");
  assert.equal(metadata.entities?.tradeId, "proposal-1");
  assert.equal(metadata.before?.status, "ACCEPTED");
  assert.equal(metadata.after?.status, "PROCESSED");
});

test("settlement allows review-approved proposals to process without falling back to legacy trade rows", async () => {
  const harness = createSettlementHarness(
    buildProposalRecord({
      status: "REVIEW_APPROVED",
      reviewedAt: new Date("2026-04-04T11:30:00.000Z"),
    }),
  );
  const service = createTradeProposalSettlementService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return {
          trigger: input.trigger,
          outcome: "FAIL_REQUIRES_COMMISSIONER",
          assetFingerprint: "fp-review-approved",
          findings: [],
          remediation: {
            requiresCommissionerReview: true,
            reasons: ["Commissioner already reviewed this proposal."],
          },
          postTradeProjection: {
            available: false,
            teamA: null,
            teamB: null,
          },
        };
      },
    },
  });

  const result = await service.settle({
    actor: commissionerActor,
    proposalId: "proposal-1",
  });

  assert.equal(result.status, "PROCESSED");
  assert.equal(harness.getProposal().status, "PROCESSED");
});

test("settlement blocks hard-blocked proposals before any transfer mutation runs", async () => {
  const harness = createSettlementHarness();
  const service = createTradeProposalSettlementService(harness.client as never, {
    tradePolicyEvaluator: {
      async evaluate(input) {
        return {
          trigger: input.trigger,
          outcome: "FAIL_HARD_BLOCK",
          assetFingerprint: "fp-hard-block",
          findings: [
            {
              code: "TRADE_WINDOW_CLOSED",
              severity: "error",
              category: "hard_block",
              message: "Trades are closed.",
              teamId: null,
            },
          ],
          remediation: null,
          postTradeProjection: {
            available: false,
            teamA: null,
            teamB: null,
          },
        };
      },
    },
  });

  await assert.rejects(
    () =>
      service.settle({
        actor: commissionerActor,
        proposalId: "proposal-1",
      }),
    /TRADE_STATE_CONFLICT/,
  );

  assert.equal(harness.getProposal().status, "ACCEPTED");
  assert.equal(harness.getContractTeamId(), "team-1");
  assert.equal(harness.getRosterTeamId(), "team-1");
  assert.equal(harness.getPickTeamId(), "team-2");
  assert.equal(harness.transactions.length, 0);
});
