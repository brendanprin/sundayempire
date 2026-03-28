import { expect, test } from "@playwright/test";
import { COMMISSIONER_EMAIL } from "./helpers/api";

test.describe("Commissioner Operations Zones", () => {
  test("commissioner sees priority operations ahead of routine and advanced tools", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-dynasty-user-email": COMMISSIONER_EMAIL });
    await page.goto("/commissioner");

    const priorityZone = page.getByTestId("commissioner-priority-zone");
    const teamOpsZone = page.getByTestId("commissioner-team-ops-zone");
    const routineZone = page.getByTestId("commissioner-routine-zone");
    const advancedZone = page.getByTestId("commissioner-advanced-zone");

    await expect(page.getByRole("heading", { name: "Commissioner Operations" })).toBeVisible();
    await expect(priorityZone).toBeVisible();
    await expect(teamOpsZone).toBeVisible();
    await expect(routineZone).toBeVisible();
    await expect(advancedZone).toBeVisible();

    await expect(priorityZone.getByRole("heading", { name: "Priority Operations" })).toBeVisible();
    await expect(priorityZone.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(priorityZone.getByText("Trade Operations", { exact: true })).toBeVisible();
    await expect(priorityZone.getByText("Lifecycle and Deadlines", { exact: true })).toBeVisible();
    await expect(priorityZone.getByText("Sync Queue", { exact: true })).toBeVisible();
    await expect(priorityZone.getByText("Audit Visibility", { exact: true })).toBeVisible();

    await expect(teamOpsZone.getByRole("heading", { name: "Team and Contract Operations" })).toBeVisible();
    await expect(routineZone.getByRole("heading", { name: "Routine Weekly Operations" })).toBeVisible();
    await expect(routineZone.getByRole("heading", { name: "League Settings" })).toBeVisible();
    await expect(routineZone.getByTestId("commissioner-routine-phase-card").getByText("Active Phase")).toBeVisible();
    await expect(
      routineZone.getByTestId("commissioner-routine-compliance-card").getByText("Compliance Scan"),
    ).toBeVisible();
    await expect(routineZone.getByRole("heading", { name: "Recent Transactions" })).toBeVisible();

    await expect(advancedZone.getByRole("heading", { name: "Advanced Operations" })).toBeVisible();
    await expect(advancedZone.getByText("Offseason Rollover")).toHaveCount(0);
    await advancedZone.getByTestId("commissioner-advanced-zone-toggle").click();
    await expect(advancedZone.getByText("Offseason Rollover")).toBeVisible();
    await expect(advancedZone.getByRole("heading", { name: "Emergency Team Fix" })).toBeVisible();
    await expect(
      advancedZone.getByRole("heading", { name: "Snapshot Backup and Restore" }),
    ).toBeVisible();

    await expect(routineZone.getByText("Emergency Team Fix")).toHaveCount(0);
    await expect(routineZone.getByText("Snapshot Backup and Restore")).toHaveCount(0);

    const [priorityBox, teamOpsBox, routineBox, advancedBox] = await Promise.all([
      priorityZone.boundingBox(),
      teamOpsZone.boundingBox(),
      routineZone.boundingBox(),
      advancedZone.boundingBox(),
    ]);

    expect(priorityBox).not.toBeNull();
    expect(teamOpsBox).not.toBeNull();
    expect(routineBox).not.toBeNull();
    expect(advancedBox).not.toBeNull();
    expect((priorityBox?.y ?? 0)).toBeLessThan(routineBox?.y ?? 0);
    expect((teamOpsBox?.y ?? 0)).toBeGreaterThan(priorityBox?.y ?? 0);
    expect((routineBox?.y ?? 0)).toBeLessThan(advancedBox?.y ?? 0);
  });
});
