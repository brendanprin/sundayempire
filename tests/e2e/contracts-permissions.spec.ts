import { expect, test } from "@playwright/test";
import { apiContext, COMMISSIONER_EMAIL, OWNER_EMAIL, getRoster, getTeams, patchContract } from "./helpers/api";

test.describe("Contract Permissions", () => {
  test("owner cannot update contracts via API", async ({ baseURL }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(0);

    const roster = await getRoster(commissioner, teams[0].id);
    const contract = roster.contracts?.[0];
    expect(contract).toBeTruthy();

    const owner = await apiContext(baseURL as string, OWNER_EMAIL);
    const { response, payload } = await patchContract(owner, contract.id, {
      salary: contract.salary + 1,
    });

    expect(response.status()).toBe(403);
    expect(payload.error?.code).toBe("FORBIDDEN");

    await owner.dispose();
    await commissioner.dispose();
  });

  test("team detail UI disables contract controls for owners", async ({ page, baseURL }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerTeams = await getTeams(ownerApi);
    expect(ownerTeams.length).toBe(1);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/teams/${ownerTeams[0].id}`);

    await expect(page.getByText("Only commissioners can modify contracts.")).toBeVisible();

    const saveButtons = page.getByRole("button", { name: "Save" });
    const saveCount = await saveButtons.count();
    if (saveCount > 0) {
      await expect(saveButtons.first()).toBeDisabled();
    }

    await ownerApi.dispose();
  });
});
