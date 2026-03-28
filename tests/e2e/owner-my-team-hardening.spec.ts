import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getTeams,
} from "./helpers/api";

test.describe("Owner My Team Hardening", () => {
  test("owner sees lineup controls but not commissioner contract administration controls", async ({
    page,
    baseURL,
  }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerTeams = await getTeams(ownerApi);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${ownerTeamId}`);

    await expect(page.getByRole("heading", { name: "Roster Action Guide" })).toBeVisible();
    await expect
      .poll(async () => {
        const [toBenchCount, toIrCount, swapCount, cutCount, activateCount] = await Promise.all([
          page.getByRole("button", { name: "To Bench" }).count(),
          page.getByRole("button", { name: "To IR" }).count(),
          page.getByRole("button", { name: "Swap" }).count(),
          page.getByRole("button", { name: "Cut" }).count(),
          page.getByRole("button", { name: "Activate" }).count(),
        ]);
        return toBenchCount + toIrCount + swapCount + cutCount + activateCount;
      })
      .toBeGreaterThan(0);

    const contractsSection = page.getByTestId("team-contracts-section");
    await expect(contractsSection).toBeVisible();
    await expect(contractsSection.getByText("Only commissioners can modify contracts.")).toBeVisible();
    await expect(contractsSection.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(contractsSection.getByRole("button", { name: "Apply Tag" })).toHaveCount(0);
    await expect(contractsSection.locator('input[type="number"]')).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Compliance Findings" })).toBeVisible();
    await expect(
      page.getByText("Each finding includes a next step so owners can resolve issues quickly."),
    ).toBeVisible();

    const findings = page.getByTestId("compliance-finding");
    const findingCount = await findings.count();
    if (findingCount > 0) {
      const nextSteps = page.getByTestId("compliance-next-step");
      await expect(nextSteps).toHaveCount(findingCount);
      await expect(nextSteps.first()).toContainText("Next step:");
    }

    await ownerApi.dispose();
  });

  test("owner can browse another team's details but cannot mutate that team", async ({ baseURL }) => {
    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const ownerTeams = await getTeams(owner);
    expect(ownerTeams.length).toBe(1);
    const ownerTeamId = ownerTeams[0].id;

    const allTeams = await getTeams(commissioner);
    const otherTeam = allTeams.find((team) => team.id !== ownerTeamId);
    expect(otherTeam).toBeTruthy();
    if (!otherTeam) {
      throw new Error("Expected at least one non-owner team.");
    }

    const [summaryResponse, complianceResponse, rosterResponse] = await Promise.all([
      owner.get(`/api/teams/${otherTeam.id}`),
      owner.get(`/api/teams/${otherTeam.id}/compliance`),
      owner.get(`/api/teams/${otherTeam.id}/roster`),
    ]);

    expect(summaryResponse.status()).toBe(200);
    expect(complianceResponse.status()).toBe(200);
    expect(rosterResponse.status()).toBe(200);

    const [summaryPayload, compliancePayload, rosterPayload] = await Promise.all([
      summaryResponse.json(),
      complianceResponse.json(),
      rosterResponse.json(),
    ]);
    expect(summaryPayload.team?.id).toBe(otherTeam.id);
    expect(compliancePayload.teamId).toBe(otherTeam.id);
    expect(rosterPayload.team?.id).toBe(otherTeam.id);

    const blockedMutation = await owner.patch(`/api/teams/${otherTeam.id}/roster`, {
      data: {},
    });
    const blockedPayload = await blockedMutation.json();
    expect(blockedMutation.status()).toBe(403);
    expect(blockedPayload.error?.code).toBe("FORBIDDEN");

    await owner.dispose();
    await commissioner.dispose();
  });
});
