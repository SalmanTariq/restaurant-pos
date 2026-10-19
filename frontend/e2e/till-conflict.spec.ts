import { expect, test } from "@playwright/test";
import { mockApi, sampleTill, signIn, waitForTill } from "./helpers";

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

  test("renumbers a token another till already used and asks for a reprint", async ({ page }) => {
    const afternoon = new Date();
    afternoon.setHours(14, 0, 0, 0);
    await page.clock.setFixedTime(afternoon);
    const till = sampleTill();
    till.orders = [];
    till.nextToken = 1;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    });
    await mockApi(page, { till, tokenTaken: true });
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await expect(page.locator(".token-chip")).toHaveText("Token 1");
    await page.getByRole("button", { name: /Tandoori Roti/ }).click();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.getByRole("button", { name: /^Cash/ }).click();
    await expect(page.getByRole("button", { name: /Reprint the ticket/ })).toContainText("token 2");
    await expect(page.locator(".token-chip")).toHaveText("Token 3");
  });
});
