import { expect, test } from "@playwright/test";
import {
  apiContext,
  OWNER_EMAIL,
  getPrimaryLeagueId,
} from "./helpers/api";

test.describe("Owner Dashboard Action Queue", () => {
  test("trade card keeps a direct review link in the owner dashboard priority zone", async ({ page, baseURL }) => {
    const ownerApi = await apiContext(baseURL as string, OWNER_EMAIL);
    const ownerLeagueId = await getPrimaryLeagueId(ownerApi);

    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": OWNER_EMAIL });
    await page.goto(`/league/${ownerLeagueId}`);

    await expect(page.getByTestId("owner-action-queue")).toBeVisible();
    await expect(page.getByTestId("owner-action-trade-review")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Action Inbox" })).toBeVisible();

    const reviewLink = page.getByTestId("owner-action-link-trade-review");
    await expect(reviewLink).toBeVisible();
    await expect(reviewLink).toHaveAttribute("href", "/trades");

    await reviewLink.click();
    await expect(page).toHaveURL(/\/trades$/);

    await ownerApi.dispose();
  });
});
