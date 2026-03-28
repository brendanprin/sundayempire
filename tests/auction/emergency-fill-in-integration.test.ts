import assert from "node:assert/strict";
import test from "node:test";
import { createPostAuctionService } from "@/lib/domain/auction/post-auction-service";

function buildMockClientForFillIn() {
  return {
    team: {
      async findMany() {
        return [
          {
            id: "team-short",
            leagueId: "league-1",
            seasonId: "season-1",
            name: "Short Roster Team",
            contracts: [
              { playerId: "player-1", status: "ACTIVE" },
              { playerId: "player-2", status: "ACTIVE" },
              // Only 2 active contracts - below minimum
            ],
          },
          {
            id: "team-full",
            leagueId: "league-1", 
            seasonId: "season-1",
            name: "Full Roster Team",
            contracts: Array.from({ length: 15 }, (_, i) => ({
              playerId: `full-player-${i + 1}`,
              status: "ACTIVE",
            })),
          },
        ];
      },
    },
    auctionPlayerPoolEntry: {
      async findMany() {
        return [
          {
            id: "available-1",
            playerId: "available-player-1",
            status: "EXPIRED",
            award: null,
            player: {
              id: "available-player-1",
              name: "Available Player 1",
              position: "RB",
              team: "FA",
            },
          },
          {
            id: "available-2",
            playerId: "available-player-2", 
            status: "EXPIRED",
            award: null,
            player: {
              id: "available-player-2",
              name: "Available Player 2",
              position: "WR", 
              team: "FA",
            },
          },
        ];
      },
    },
    contract: {
      async createMany() {
        return { count: 2 };
      },
    },
    commissionerOverride: {
      async create() {
        return { id: "override-1" };
      },
    },
    notification: {
      async createMany() {
        return { count: 2 };
      },
    },
  } as any;
}

test("emergency fill-in detects short rosters", async () => {
  const client = buildMockClientForFillIn();
  const service = createPostAuctionService(client);

  const result = await service.detectAndExecuteEmergencyFillIn({
    leagueId: "league-1",
    seasonId: "season-1",
    draftId: "draft-1",
    actor: {
      userId: "commissioner-1",
      leagueRole: "COMMISSIONER",
    },
  });

  // Should fill the short team
  assert.equal(result.teamsProcessed, 2);
  assert.equal(result.fillInsExecuted, 1);
  assert.deepEqual(result.teamsFilled, ["team-short"]);
});

test("emergency fill-in only processes teams with minimum contract deficit", async () => {
  const client = {
    ...buildMockClientForFillIn(),
    team: {
      async findMany() {
        return [
          {
            id: "team-borderline",
            leagueId: "league-1",
            seasonId: "season-1",
            name: "Borderline Team",
            contracts: Array.from({ length: 10 }, (_, i) => ({
              playerId: `borderline-player-${i + 1}`,
              status: "ACTIVE",
            })),
          },
        ];
      },
    },
  };

  const service = createPostAuctionService(client as any);

  const result = await service.detectAndExecuteEmergencyFillIn({
    leagueId: "league-1",
    seasonId: "season-1", 
    draftId: "draft-1",
    actor: {
      userId: "commissioner-1",
      leagueRole: "COMMISSIONER",
    },
  });

  // Team with 10 contracts doesn't need emergency fill-in
  assert.equal(result.fillInsExecuted, 0);
  assert.deepEqual(result.teamsFilled, []);
});

test("emergency fill-in creates constitutional 1-year $1 contracts", async () => {
  const client = buildMockClientForFillIn();
  let createdContracts: any[] = [];
  
  client.contract.createMany = async ({ data }) => {
    createdContracts = data;
    return { count: data.length };
  };

  const service = createPostAuctionService(client);

  await service.detectAndExecuteEmergencyFillIn({
    leagueId: "league-1",
    seasonId: "season-1",
    draftId: "draft-1",
    actor: {
      userId: "commissioner-1",
      leagueRole: "COMMISSIONER",
    },
  });

  // Verify constitutional contract terms
  assert.equal(createdContracts.length, 2); // Two contracts for short team
  
  for (const contract of createdContracts) {
    assert.equal(contract.teamId, "team-short");
    assert.equal(contract.leagueId, "league-1");
    assert.equal(contract.seasonId, "season-1");
    assert.equal(contract.status, "ACTIVE");
    assert.equal(contract.annualSalary, 1); // $1 constitutional minimum
    assert.equal(contract.contractYears, 1); // 1-year constitutional term
    assert.equal(contract.contractType, "EMERGENCY_FILL_IN");
    assert.match(contract.notes, /Emergency post-auction fill-in/);
  }
});

test("emergency fill-in fails without commissioner privileges", async () => {
  const client = buildMockClientForFillIn();
  const service = createPostAuctionService(client);

  try {
    await service.detectAndExecuteEmergencyFillIn({
      leagueId: "league-1",
      seasonId: "season-1",
      draftId: "draft-1",
      actor: {
        userId: "owner-1",
        leagueRole: "MEMBER", // Not commissioner
      },
    });
    assert.fail("Should have thrown forbidden error");
  } catch (error: any) {
    assert.equal(error.message, "FORBIDDEN");
  }
});

test("emergency fill-in creates commissioner override records", async () => {
  const client = buildMockClientForFillIn();
  let overrideCreated: any;
  
  client.commissionerOverride.create = async (data) => {
    overrideCreated = data;
    return { id: "override-1" };
  };

  const service = createPostAuctionService(client);

  await service.detectAndExecuteEmergencyFillIn({
    leagueId: "league-1",
    seasonId: "season-1",
    draftId: "draft-1",
    actor: {
      userId: "commissioner-1",
      leagueRole: "COMMISSIONER",
    },
  });

  // Verify override record
  assert.equal(overrideCreated.data.actorUserId, "commissioner-1");
  assert.equal(overrideCreated.data.leagueId, "league-1");
  assert.equal(overrideCreated.data.actionType, "emergency-fill-in");
  assert.match(overrideCreated.data.reason, /Emergency post-auction roster fill-in/);
  assert.equal(overrideCreated.data.targetType, "team");
  assert.equal(overrideCreated.data.targetId, "team-short");
});
