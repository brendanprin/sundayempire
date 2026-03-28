import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  createTrade,
  getRoster,
  getTeams,
} from "./helpers/api";

function pickAsset(futurePickId: string) {
  return { assetType: "PICK", futurePickId };
}

test.describe("Owner Team Scope", () => {
  test("owner cannot mutate another team's roster", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const otherTeam = allTeams.find((team) => team.id !== ownerTeamId);
    expect(otherTeam).toBeTruthy();

    const response = await owner.patch(`/api/teams/${otherTeam?.id}/roster`, {
      data: {},
    });
    const payload = await response.json();

    expect(response.status()).toBe(403);
    expect(payload.error?.code).toBe("FORBIDDEN");

    await owner.dispose();
    await commissioner.dispose();
  });

  test("owner cannot create trade that excludes owner team", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const otherTeams = (await getTeams(commissioner)).filter((team) => team.id !== ownerTeamId);
    expect(otherTeams.length).toBeGreaterThan(1);

    const teamA = otherTeams[0];
    const teamB = otherTeams[1];
    const [rosterA, rosterB] = await Promise.all([
      getRoster(commissioner, teamA.id),
      getRoster(commissioner, teamB.id),
    ]);

    const pickA = rosterA.picks.find((pick: { isUsed: boolean }) => !pick.isUsed);
    const pickB = rosterB.picks.find((pick: { isUsed: boolean }) => !pick.isUsed);
    expect(pickA).toBeTruthy();
    expect(pickB).toBeTruthy();

    const { response, payload } = await createTrade(owner, {
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAAssets: [pickAsset(pickA.id)],
      teamBAssets: [pickAsset(pickB.id)],
    });

    expect(response.status()).toBe(403);
    expect(payload.error?.code).toBe("FORBIDDEN");

    await owner.dispose();
    await commissioner.dispose();
  });

  test("owner can create trade when owner team is included", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const counterpartyTeam = allTeams.find((team) => team.id !== ownerTeamId);
    expect(counterpartyTeam).toBeTruthy();

    const [ownerRoster, counterpartyRoster] = await Promise.all([
      getRoster(commissioner, ownerTeamId),
      getRoster(commissioner, counterpartyTeam?.id as string),
    ]);

    const ownerPick = ownerRoster.picks.find((pick: { isUsed: boolean }) => !pick.isUsed);
    const counterpartyPick = counterpartyRoster.picks.find(
      (pick: { isUsed: boolean }) => !pick.isUsed,
    );
    expect(ownerPick).toBeTruthy();
    expect(counterpartyPick).toBeTruthy();

    const { response, payload } = await createTrade(owner, {
      teamAId: ownerTeamId,
      teamBId: counterpartyTeam?.id,
      notes: `owner-scope-${Date.now()}`,
      teamAAssets: [pickAsset(ownerPick.id)],
      teamBAssets: [pickAsset(counterpartyPick.id)],
    });

    expect(response.status()).not.toBe(403);
    expect(payload.error?.code).not.toBe("FORBIDDEN");

    await owner.dispose();
    await commissioner.dispose();
  });
});
