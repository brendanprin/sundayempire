import { APIRequestContext, expect, request, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getLeagues,
  getTeams,
} from "./helpers/api";

type MutationCase = {
  id: string;
  method: "post" | "patch";
  path: string;
  data?: Record<string, unknown>;
};

const COMMISSIONER_ONLY_MUTATIONS: MutationCase[] = [
  {
    id: "commissioner-season-phase",
    method: "post",
    path: "/api/commissioner/season/phase",
    data: { phase: "NOT_A_REAL_PHASE" },
  },
  {
    id: "commissioner-rollover",
    method: "post",
    path: "/api/commissioner/rollover",
    data: { dryRun: true },
  },
  {
    id: "commissioner-compliance-run",
    method: "post",
    path: "/api/commissioner/compliance/run",
    data: {},
  },
  {
    id: "commissioner-override-fix-team",
    method: "post",
    path: "/api/commissioner/override/fix-team",
    data: { teamId: "not-real-id", dryRun: true },
  },
  {
    id: "commissioner-snapshot-import",
    method: "post",
    path: "/api/commissioner/snapshot/import",
    data: {},
  },
  {
    id: "league-patch",
    method: "patch",
    path: "/api/league",
    data: {},
  },
  {
    id: "rules-patch",
    method: "patch",
    path: "/api/rules",
    data: {},
  },
  {
    id: "teams-create",
    method: "post",
    path: "/api/teams",
    data: {},
  },
  {
    id: "team-update",
    method: "patch",
    path: "/api/teams/not-real-id",
    data: { name: "X" },
  },
  {
    id: "drafts-create",
    method: "post",
    path: "/api/drafts",
    data: {},
  },
  {
    id: "draft-lifecycle-update",
    method: "patch",
    path: "/api/drafts/not-real-id",
    data: { action: "ADVANCE_PICK" },
  },
  {
    id: "owners-create",
    method: "post",
    path: "/api/owners",
    data: {},
  },
  {
    id: "owner-update",
    method: "patch",
    path: "/api/owners/not-real-id",
    data: { name: "Owner Name" },
  },
  {
    id: "contracts-create",
    method: "post",
    path: "/api/contracts",
    data: {},
  },
  {
    id: "contract-update",
    method: "patch",
    path: "/api/contracts/not-real-id",
    data: { salary: 1 },
  },
  {
    id: "contract-franchise-tag",
    method: "post",
    path: "/api/contracts/not-real-id/franchise-tag",
    data: {},
  },
  {
    id: "contract-exercise-option",
    method: "post",
    path: "/api/contracts/not-real-id/exercise-option",
    data: {},
  },
  {
    id: "pick-owner-transfer",
    method: "patch",
    path: "/api/picks/not-real-id/owner",
    data: { newTeamId: "not-real-team-id" },
  },
  {
    id: "players-import",
    method: "post",
    path: "/api/players/import",
    data: {},
  },
  {
    id: "commissioner-player-refresh-trigger",
    method: "post",
    path: "/api/commissioner/player-refresh/jobs",
    data: {},
  },
  {
    id: "commissioner-player-refresh-resolve",
    method: "post",
    path: "/api/commissioner/player-refresh/changes/not-real-id/resolve",
    data: { action: "REJECT" },
  },
  {
    id: "commissioner-player-refresh-player-patch",
    method: "patch",
    path: "/api/commissioner/player-refresh/players/not-real-id",
    data: { restricted: true },
  },
  {
    id: "commissioner-trade-settle",
    method: "post",
    path: "/api/commissioner/trades/not-real-id/settle",
    data: {},
  },
  {
    id: "trade-reject",
    method: "post",
    path: "/api/trades/not-real-id/reject",
    data: {},
  },
];

const NOT_FOUND_COMPATIBLE_MUTATION_IDS = new Set([
  "team-update",
  "draft-lifecycle-update",
  "owner-update",
  "contract-update",
  "contract-franchise-tag",
  "contract-exercise-option",
  "pick-owner-transfer",
  "commissioner-player-refresh-resolve",
  "commissioner-player-refresh-player-patch",
  "commissioner-trade-settle",
  "trade-reject",
]);

async function invokeMutation(ctx: APIRequestContext, mutation: MutationCase) {
  if (mutation.method === "post") {
    return ctx.post(mutation.path, { data: mutation.data ?? {} });
  }

  return ctx.patch(mutation.path, { data: mutation.data ?? {} });
}

async function readJsonSafely(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  const text = await response.text();
  try {
    return JSON.parse(text) as {
      error?: {
        code?: string;
      };
    };
  } catch {
    return null;
  }
}

test.describe("Mutation RBAC Guards", () => {
  test("unauthenticated mutation requests are rejected", async ({ baseURL }) => {
    const anonymous = await request.newContext({
      baseURL: baseURL as string,
      extraHTTPHeaders: {
        "content-type": "application/json",
      },
    });

    for (const mutation of COMMISSIONER_ONLY_MUTATIONS) {
      await test.step(mutation.id, async () => {
        const response = await invokeMutation(anonymous, mutation);
        const payload = await readJsonSafely(response);

        expect(response.status()).toBe(401);
        expect(payload?.error?.code).toBe("AUTH_REQUIRED");
      });
    }

    await anonymous.dispose();
  });

  test("owner is denied for commissioner-only mutation endpoints", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);

    for (const mutation of COMMISSIONER_ONLY_MUTATIONS) {
      await test.step(mutation.id, async () => {
        const response = await invokeMutation(owner, mutation);
        const payload = await readJsonSafely(response);

        const expectedStatuses = NOT_FOUND_COMPATIBLE_MUTATION_IDS.has(mutation.id)
          ? [403, 404]
          : [403];

        expect(expectedStatuses).toContain(response.status());
        if (response.status() === 403) {
          expect(payload?.error?.code).toBe("FORBIDDEN");
        } else {
          expect(payload?.error?.code?.endsWith("_NOT_FOUND")).toBeTruthy();
        }
      });
    }

    await owner.dispose();
  });

  test("commissioner passes RBAC guard for commissioner-only mutation endpoints", async ({ baseURL }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    for (const mutation of COMMISSIONER_ONLY_MUTATIONS) {
      await test.step(mutation.id, async () => {
        const response = await invokeMutation(commissioner, mutation);

        expect(response.status()).not.toBe(401);
        expect(response.status()).not.toBe(403);
        expect(response.status()).toBeLessThan(500);
      });
    }

    await commissioner.dispose();
  });

  test("owner still reaches owner-permitted mutation endpoints", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);

    const teamsResponse = await owner.get("/api/teams");
    expect(teamsResponse.ok()).toBeTruthy();
    const teamsPayload = (await teamsResponse.json()) as {
      teams: Array<{ id: string }>;
    };

    const ownerTeamId = teamsPayload.teams[0]?.id;
    expect(ownerTeamId).toBeTruthy();

    const rosterPatchResponse = await owner.patch(`/api/teams/${ownerTeamId}/roster`, {
      data: {},
    });
    expect(rosterPatchResponse.status()).toBe(400);
    expect(rosterPatchResponse.status()).not.toBe(403);

    const tradeCreateResponse = await owner.post("/api/trades", {
      data: {},
    });
    expect(tradeCreateResponse.status()).toBe(400);
    expect(tradeCreateResponse.status()).not.toBe(403);

    await owner.dispose();
  });

  test("resource-scoped mutations use the resource league instead of the selected league", async ({
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const leagues = await getLeagues(commissioner);
    if (leagues.length < 2) {
      await commissioner.dispose();
      test.skip(true, "Need at least two commissioner-accessible leagues to verify cross-league routing.");
    }

    const resourceLeagueId = leagues[0]?.id;
    const alternateLeagueId = leagues.find((league) => league.id !== resourceLeagueId)?.id;
    expect(resourceLeagueId).toBeTruthy();
    expect(alternateLeagueId).toBeTruthy();

    const resourceLeagueContext = await apiContext(
      baseURL as string,
      COMMISSIONER_EMAIL,
      resourceLeagueId,
    );
    const resourceTeams = await getTeams(resourceLeagueContext);
    const resourceTeamId = resourceTeams[0]?.id;
    expect(resourceTeamId).toBeTruthy();

    const alternateLeagueContext = await apiContext(
      baseURL as string,
      COMMISSIONER_EMAIL,
      alternateLeagueId,
    );
    const response = await alternateLeagueContext.patch(`/api/teams/${resourceTeamId}/roster`, {
      data: {},
    });
    const payload = await readJsonSafely(response);

    expect(response.status()).toBe(400);
    expect(payload?.error?.code).toBe("INVALID_REQUEST");

    await Promise.all([
      commissioner.dispose(),
      resourceLeagueContext.dispose(),
      alternateLeagueContext.dispose(),
    ]);
  });
});
