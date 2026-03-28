import assert from "node:assert/strict";
import test from "node:test";
import { createComplianceEvaluationService } from "@/lib/compliance/service";
import { buildBaseValidationContext } from "./fixtures";

test("compliance team evaluation reads through the injected read-only loader", async () => {
  const calls = {
    loader: 0,
  };

  const context = buildBaseValidationContext({
    contracts: [
      {
        id: "contract-1",
        salary: 50,
        yearsTotal: 2,
        yearsRemaining: 2,
        isFranchiseTag: false,
        player: {
          id: "player-1",
          name: "Alpha RB",
          position: "RB",
        },
      },
    ],
  });

  const service = createComplianceEvaluationService({
    validationContextLoader: {
      async loadTeamValidationContext() {
        calls.loader += 1;
        return context;
      },
    },
    teamReader: {
      async findMany() {
        return [];
      },
    } as never,
  });

  const report = await service.evaluateTeamCompliance({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
  });

  assert.equal(calls.loader, 1);
  assert.ok(report);
  assert.equal(report?.teamId, "team-1");
});

test("league compliance evaluation iterates teams through the read-only loader", async () => {
  const calls: string[] = [];
  const context = buildBaseValidationContext();

  const service = createComplianceEvaluationService({
    validationContextLoader: {
      async loadTeamValidationContext(input) {
        calls.push(input.teamId);
        return {
          ...context,
          team: {
            ...context.team,
            id: input.teamId,
            name: `Team ${input.teamId}`,
          },
        };
      },
    },
    teamReader: {
      async findMany() {
        return [{ id: "team-1" }, { id: "team-2" }];
      },
    } as never,
  });

  const report = await service.evaluateLeagueCompliance({
    leagueId: "league-1",
    seasonId: "season-1",
  });

  assert.deepEqual(calls, ["team-1", "team-2"]);
  assert.equal(report.summary.teamsEvaluated, 2);
  assert.equal(report.teams.length, 2);
});
