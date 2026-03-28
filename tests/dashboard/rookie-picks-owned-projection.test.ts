import assert from "node:assert/strict";
import test from "node:test";
import { createRookiePicksOwnedProjection } from "@/lib/read-models/dashboard/rookie-picks-owned-projection";

test("rookie picks projection groups owned picks by season and round", async () => {
  const projection = createRookiePicksOwnedProjection({
    league: {
      async findUnique() {
        return { id: "league-1", name: "Dynasty League" };
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-1",
          leagueId: "league-1",
          year: 2026,
        };
      },
    },
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "Pick Hoarders",
          abbreviation: "PH",
        };
      },
    },
    futurePick: {
      async findMany() {
        return [
          {
            id: "pick-1",
            seasonYear: 2026,
            round: 1,
            overall: 3,
            originalTeam: { id: "orig-1", name: "Original One", abbreviation: "O1" },
          },
          {
            id: "pick-2",
            seasonYear: 2027,
            round: 2,
            overall: null,
            originalTeam: { id: "orig-2", name: "Original Two", abbreviation: "O2" },
          },
          {
            id: "pick-3",
            seasonYear: 2027,
            round: 2,
            overall: null,
            originalTeam: { id: "orig-3", name: "Original Three", abbreviation: "O3" },
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    now: new Date("2026-04-01T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.team.name, "Pick Hoarders");
  assert.equal(result.seasons.length, 2);
  assert.equal(result.seasons[0]?.seasonYear, 2026);
  assert.equal(result.seasons[0]?.rounds[0]?.picks[0]?.overall, 3);
  assert.equal(result.seasons[1]?.totalCount, 2);
});

test("rookie picks projection stays empty-state safe when no unused picks are owned", async () => {
  const projection = createRookiePicksOwnedProjection({
    league: {
      async findUnique() {
        return { id: "league-1", name: "Dynasty League" };
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-1",
          leagueId: "league-1",
          year: 2026,
        };
      },
    },
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "No Picks",
          abbreviation: null,
        };
      },
    },
    futurePick: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    now: new Date("2026-04-01T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.deepEqual(result.seasons, []);
  assert.equal(result.seasonWindow.startYear, 2026);
  assert.equal(result.seasonWindow.endYear, 2028);
});
