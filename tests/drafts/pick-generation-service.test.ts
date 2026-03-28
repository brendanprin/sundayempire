import assert from "node:assert/strict";
import test from "node:test";
import { createPickGenerationService } from "@/lib/domain/draft/pick-generation-service";

test("pick generation service creates missing rookie picks with safe fallback ordering", async () => {
  const picks: Array<Record<string, unknown>> = [
    {
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
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  const service = createPickGenerationService({
    team: {
      async findMany() {
        return [
          { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
          { id: "team-2", name: "Bench Mob", abbreviation: "BEN" },
        ];
      },
    },
    futurePick: {
      async findMany() {
        return picks as never;
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        for (const [index, row] of args.data.entries()) {
          picks.push({
            id: `pick-created-${index + 1}`,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            originalTeam: {
              id: row.originalTeamId,
              name: row.originalTeamId === "team-1" ? "Cap Casualties" : "Bench Mob",
              abbreviation: row.originalTeamId === "team-1" ? "CAP" : "BEN",
            },
            currentTeam: {
              id: row.currentTeamId,
              name: row.currentTeamId === "team-1" ? "Cap Casualties" : "Bench Mob",
              abbreviation: row.currentTeamId === "team-1" ? "CAP" : "BEN",
            },
            ...row,
          });
        }
        return { count: args.data.length };
      },
    },
  } as never);

  const result = await service.ensureSupportedSeasonPicks({
    leagueId: "league-1",
    seasonYear: 2026,
    rounds: [1],
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.picks.length, 2);
  assert.equal(result.picks[1]?.overall, null);
  assert.ok(result.warnings.some((warning) => warning.code === "PARTIAL_PICK_SET_ROUND_1"));
});
