import assert from "node:assert/strict";
import test from "node:test";
import { createTradePolicyEvaluator } from "@/lib/domain/trades/trade-policy-evaluator";

function createBaseClient() {
  return {
    season: {
      async findFirst() {
        return {
          id: "season-1",
          phase: "REGULAR_SEASON",
        };
      },
    },
    player: {
      async findMany() {
        return [];
      },
    },
    contract: {
      async findMany() {
        return [];
      },
    },
    rosterAssignment: {
      async findMany() {
        return [];
      },
    },
    futurePick: {
      async findMany() {
        return [];
      },
    },
  };
}

test("trade policy evaluator hard-blocks packages without a player on each side", async () => {
  const service = createTradePolicyEvaluator(
    {
      ...createBaseClient(),
      futurePick: {
        async findMany() {
          return [
            {
              id: "pick-1",
              currentTeamId: "team-1",
              isUsed: false,
            },
            {
              id: "pick-2",
              currentTeamId: "team-2",
              isUsed: false,
            },
          ];
        },
      },
    } as never,
    {
      postTradeProjectionService: {
        async project() {
          return {
            available: false,
            teamA: null,
            teamB: null,
          };
        },
      },
    },
  );

  const evaluation = await service.evaluate({
    leagueId: "league-1",
    seasonId: "season-1",
    proposerTeamId: "team-1",
    counterpartyTeamId: "team-2",
    trigger: "SUBMIT",
    assets: [
      {
        fromTeamId: "team-1",
        toTeamId: "team-2",
        assetType: "PICK",
        playerId: null,
        futurePickId: "pick-1",
        contractId: null,
        assetOrder: 0,
        snapshotLabel: null,
      },
      {
        fromTeamId: "team-2",
        toTeamId: "team-1",
        assetType: "PICK",
        playerId: null,
        futurePickId: "pick-2",
        contractId: null,
        assetOrder: 1,
        snapshotLabel: null,
      },
    ],
  });

  assert.equal(evaluation.outcome, "FAIL_HARD_BLOCK");
  assert.ok(
    evaluation.findings.some((finding) => finding.code === "PROPOSER_PLAYER_REQUIRED"),
  );
  assert.ok(
    evaluation.findings.some((finding) => finding.code === "COUNTERPARTY_PLAYER_REQUIRED"),
  );
});

test("trade policy evaluator routes tagged players to commissioner review", async () => {
  const service = createTradePolicyEvaluator(
    {
      ...createBaseClient(),
      player: {
        async findMany() {
          return [
            {
              id: "player-1",
              name: "Tagged QB",
              isRestricted: false,
            },
            {
              id: "player-2",
              name: "Return WR",
              isRestricted: false,
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
              teamId: "team-1",
              status: "TAGGED",
              isFranchiseTag: true,
            },
            {
              id: "contract-2",
              playerId: "player-2",
              teamId: "team-2",
              status: "ACTIVE",
              isFranchiseTag: false,
            },
          ];
        },
      },
      rosterAssignment: {
        async findMany() {
          return [
            {
              playerId: "player-1",
              teamId: "team-1",
            },
            {
              playerId: "player-2",
              teamId: "team-2",
            },
          ];
        },
      },
    } as never,
    {
      postTradeProjectionService: {
        async project() {
          return {
            available: true,
            teamA: {
              teamId: "team-1",
              teamName: "Cap Casualties",
              rosterCountBefore: 1,
              rosterCountAfter: 1,
              activeCapBefore: 10,
              activeCapAfter: 4,
              deadCapBefore: 0,
              deadCapAfter: 0,
              hardCapBefore: 10,
              hardCapAfter: 4,
              complianceStatusBefore: "ok",
              complianceStatusAfter: "ok",
              introducedFindings: [],
            },
            teamB: {
              teamId: "team-2",
              teamName: "Bench Mob",
              rosterCountBefore: 1,
              rosterCountAfter: 1,
              activeCapBefore: 4,
              activeCapAfter: 10,
              deadCapBefore: 0,
              deadCapAfter: 0,
              hardCapBefore: 4,
              hardCapAfter: 10,
              complianceStatusBefore: "ok",
              complianceStatusAfter: "ok",
              introducedFindings: [],
            },
          };
        },
      },
    },
  );

  const evaluation = await service.evaluate({
    leagueId: "league-1",
    seasonId: "season-1",
    proposerTeamId: "team-1",
    counterpartyTeamId: "team-2",
    trigger: "SUBMIT",
    assets: [
      {
        fromTeamId: "team-1",
        toTeamId: "team-2",
        assetType: "PLAYER",
        playerId: "player-1",
        futurePickId: null,
        contractId: "contract-1",
        assetOrder: 0,
        snapshotLabel: null,
      },
      {
        fromTeamId: "team-2",
        toTeamId: "team-1",
        assetType: "PLAYER",
        playerId: "player-2",
        futurePickId: null,
        contractId: "contract-2",
        assetOrder: 1,
        snapshotLabel: null,
      },
    ],
  });

  assert.equal(evaluation.outcome, "FAIL_REQUIRES_COMMISSIONER");
  assert.ok(
    evaluation.findings.some((finding) => finding.code === "TAGGED_PLAYER_REVIEW_REQUIRED"),
  );
});

