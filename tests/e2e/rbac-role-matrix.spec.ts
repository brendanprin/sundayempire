import { APIRequestContext, APIResponse, expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  READ_ONLY_EMAIL,
  getRoster,
  getTeams,
} from "./helpers/api";

type CanonicalRole = "COMMISSIONER" | "MEMBER_WITH_TEAM" | "MEMBER_NO_TEAM";

type MatrixFixtures = {
  ownerTeamId: string;
  otherTeamId: string;
  secondOtherTeamId: string;
  ownerPickId: string;
  otherPickId: string;
  secondOtherPickId: string;
};

type MatrixCase = {
  id: string;
  request: (ctx: APIRequestContext, fixtures: MatrixFixtures) => Promise<APIResponse>;
  expectedStatus: Record<CanonicalRole, number>;
};

const ROLE_EMAILS: Record<CanonicalRole, string> = {
  COMMISSIONER: COMMISSIONER_EMAIL,
  MEMBER_WITH_TEAM: OWNER_EMAIL,
  MEMBER_NO_TEAM: READ_ONLY_EMAIL,
};

async function assertRoleIdentity(ctx: APIRequestContext, expectedRole: CanonicalRole) {
  const response = await ctx.get("/api/auth/me");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    actor: {
      leagueRole: "COMMISSIONER" | "MEMBER";
      teamId: string | null;
    };
  };
  if (expectedRole === "COMMISSIONER") {
    expect(payload.actor.leagueRole).toBe("COMMISSIONER");
    return;
  }

  expect(payload.actor.leagueRole).toBe("MEMBER");
  if (expectedRole === "MEMBER_WITH_TEAM") {
    expect(payload.actor.teamId).toBeTruthy();
  } else {
    expect(payload.actor.teamId).toBeNull();
  }
}

async function parseErrorCode(response: APIResponse) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        code?: string;
      };
    };
    return parsed.error?.code ?? null;
  } catch {
    return null;
  }
}

function pickAsset(futurePickId: string) {
  return { assetType: "PICK", futurePickId };
}

test.describe("RBAC Role Matrix", () => {
  test("critical mutation endpoints enforce role and team scope", async ({ baseURL }) => {
    const contexts: Record<CanonicalRole, APIRequestContext> = {
      COMMISSIONER: await apiContext(baseURL as string, ROLE_EMAILS.COMMISSIONER),
      MEMBER_WITH_TEAM: await apiContext(baseURL as string, ROLE_EMAILS.MEMBER_WITH_TEAM),
      MEMBER_NO_TEAM: await apiContext(baseURL as string, ROLE_EMAILS.MEMBER_NO_TEAM),
    };

    await Promise.all([
      assertRoleIdentity(contexts.COMMISSIONER, "COMMISSIONER"),
      assertRoleIdentity(contexts.MEMBER_WITH_TEAM, "MEMBER_WITH_TEAM"),
      assertRoleIdentity(contexts.MEMBER_NO_TEAM, "MEMBER_NO_TEAM"),
    ]);

    const ownerTeams = await getTeams(contexts.MEMBER_WITH_TEAM);
    expect(ownerTeams.length).toBe(1);
    const ownerTeam = ownerTeams[0];
    if (!ownerTeam) {
      throw new Error("Owner test actor must resolve exactly one team.");
    }
    const ownerTeamId = ownerTeam.id;

    const allTeams = await getTeams(contexts.COMMISSIONER);
    const otherTeams = allTeams.filter((team) => team.id !== ownerTeamId);
    expect(otherTeams.length).toBeGreaterThan(1);

    const otherTeam = otherTeams[0];
    const secondOtherTeam = otherTeams[1];
    if (!otherTeam || !secondOtherTeam) {
      throw new Error("Need at least two non-owner teams for role matrix test.");
    }

    const otherTeamId = otherTeam.id;
    const secondOtherTeamId = secondOtherTeam.id;

    const [ownerRoster, otherRoster, secondOtherRoster] = await Promise.all([
      getRoster(contexts.COMMISSIONER, ownerTeamId),
      getRoster(contexts.COMMISSIONER, otherTeamId),
      getRoster(contexts.COMMISSIONER, secondOtherTeamId),
    ]);

    const ownerPick = ownerRoster.picks.find((pick: { isUsed: boolean }) => !pick.isUsed);
    const otherPick = otherRoster.picks.find((pick: { isUsed: boolean }) => !pick.isUsed);
    const secondOtherPick = secondOtherRoster.picks.find(
      (pick: { isUsed: boolean }) => !pick.isUsed,
    );
    expect(ownerPick).toBeTruthy();
    expect(otherPick).toBeTruthy();
    expect(secondOtherPick).toBeTruthy();
    if (!ownerPick || !otherPick || !secondOtherPick) {
      throw new Error("Expected available picks for role matrix test fixtures.");
    }

    const fixtures: MatrixFixtures = {
      ownerTeamId,
      otherTeamId,
      secondOtherTeamId,
      ownerPickId: ownerPick.id,
      otherPickId: otherPick.id,
      secondOtherPickId: secondOtherPick.id,
    };

    const cases: MatrixCase[] = [
      {
        id: "commissioner-rollover",
        request: (ctx) =>
          ctx.post("/api/commissioner/rollover", {
            data: { dryRun: true },
          }),
        expectedStatus: {
          COMMISSIONER: 200,
          MEMBER_WITH_TEAM: 403,
          MEMBER_NO_TEAM: 403,
        },
      },
      {
        id: "league-patch",
        request: (ctx) =>
          ctx.patch("/api/league", {
            data: {},
          }),
        expectedStatus: {
          COMMISSIONER: 400,
          MEMBER_WITH_TEAM: 403,
          MEMBER_NO_TEAM: 403,
        },
      },
      {
        id: "roster-patch-owner-team",
        request: (ctx, input) =>
          ctx.patch(`/api/teams/${input.ownerTeamId}/roster`, {
            data: {},
          }),
        expectedStatus: {
          COMMISSIONER: 400,
          MEMBER_WITH_TEAM: 400,
          MEMBER_NO_TEAM: 403,
        },
      },
      {
        id: "trade-create-owner-team-included",
        request: (ctx, input) =>
          ctx.post("/api/trades", {
            data: {
              teamAId: input.ownerTeamId,
              teamBId: input.otherTeamId,
              notes: `rbac-matrix-owner-team-included-${Date.now()}`,
              teamAAssets: [pickAsset(input.ownerPickId)],
              teamBAssets: [pickAsset(input.otherPickId)],
            },
          }),
        expectedStatus: {
          COMMISSIONER: 201,
          MEMBER_WITH_TEAM: 201,
          MEMBER_NO_TEAM: 403,
        },
      },
      {
        id: "trade-create-owner-team-excluded",
        request: (ctx, input) =>
          ctx.post("/api/trades", {
            data: {
              teamAId: input.otherTeamId,
              teamBId: input.secondOtherTeamId,
              notes: `rbac-matrix-owner-team-excluded-${Date.now()}`,
              teamAAssets: [pickAsset(input.otherPickId)],
              teamBAssets: [pickAsset(input.secondOtherPickId)],
            },
          }),
        expectedStatus: {
          COMMISSIONER: 201,
          MEMBER_WITH_TEAM: 403,
          MEMBER_NO_TEAM: 403,
        },
      },
    ];

    const roles: CanonicalRole[] = ["COMMISSIONER", "MEMBER_WITH_TEAM", "MEMBER_NO_TEAM"];
    for (const role of roles) {
      for (const matrixCase of cases) {
        await test.step(`${matrixCase.id} :: ${role}`, async () => {
          const response = await matrixCase.request(contexts[role], fixtures);
          expect(response.status()).toBe(matrixCase.expectedStatus[role]);

          if (matrixCase.expectedStatus[role] === 403) {
            const errorCode = await parseErrorCode(response);
            expect(errorCode).toBe("FORBIDDEN");
          }
        });
      }
    }

    await Promise.all([
      contexts.COMMISSIONER.dispose(),
      contexts.MEMBER_WITH_TEAM.dispose(),
      contexts.MEMBER_NO_TEAM.dispose(),
    ]);
  });
});
