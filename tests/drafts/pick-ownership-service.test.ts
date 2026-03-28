import assert from "node:assert/strict";
import test from "node:test";
import { createPickOwnershipService } from "@/lib/domain/draft/pick-ownership-service";

test("pick ownership service updates unresolved rookie order and board rows", async () => {
  const service = createPickOwnershipService({
    futurePick: {
      async findFirst() {
        return {
          id: "pick-1",
          leagueId: "league-1",
          seasonYear: 2026,
          round: 1,
          overall: 1,
          originalTeamId: "team-1",
          currentTeamId: "team-1",
          isUsed: false,
          originalTeam: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
          currentTeam: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
        };
      },
      async update() {
        return {
          id: "pick-1",
          leagueId: "league-1",
          seasonYear: 2026,
          round: 1,
          overall: 1,
          originalTeamId: "team-1",
          currentTeamId: "team-2",
          isUsed: false,
          originalTeam: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
          currentTeam: {
            id: "team-2",
            name: "Bench Mob",
            abbreviation: "BEN",
          },
        };
      },
    },
    team: {
      async findFirst() {
        return {
          id: "team-2",
          name: "Bench Mob",
          abbreviation: "BEN",
        };
      },
    },
    draft: {
      async findMany() {
        return [{ id: "draft-1" }];
      },
    },
    draftOrderEntry: {
      async updateMany() {
        return { count: 1 };
      },
    },
    draftPick: {
      async updateMany() {
        return { count: 1 };
      },
    },
  } as never);

  const result = await service.transferOwnership({
    leagueId: "league-1",
    seasonId: "season-1",
    pickId: "pick-1",
    newTeamId: "team-2",
  });

  assert.equal(result.pick.currentTeam.id, "team-2");
  assert.equal(result.fromTeamId, "team-1");
  assert.equal(result.toTeamId, "team-2");
  assert.equal(result.orderEntryUpdates, 1);
  assert.equal(result.draftPickUpdates, 1);
});
