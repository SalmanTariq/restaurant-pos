import { expect, test } from "@playwright/test";
import { mockApi, signIn, waitForTill } from "./helpers";

test.describe("ticket sync conflict", () => {
  test("lets the cashier keep this till’s copy of a mismatched order", async ({ page }) => {
    const afternoon = new Date();
    afternoon.setHours(14, 0, 0, 0);
    await page.clock.setFixedTime(afternoon);
    await mockApi(page, { conflictTill: true });
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("tab", { name: /Paid/ }).click();
    await expect(page.getByRole("heading", { name: "Token 7" })).toBeVisible();
    await page.getByRole("button", { name: /Delete order/ }).click();
    await page.getByRole("button", { name: "Delete token 7" }).click();
    await expect(page.getByRole("dialog", { name: "This ticket does not match the server" })).toBeVisible();
    await page.getByRole("button", { name: "Keep this till’s copy" }).click();
    await expect(page.getByRole("dialog", { name: "This ticket does not match the server" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Token 7" })).toHaveCount(0);
  });
});
