import { expect, test } from "@playwright/test";
import { mockApi, signIn, waitForTill } from "./helpers";

test.describe("sign in", () => {
  test("shows the staff login card", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Staff sign-in")).toBeVisible();
  });

  test("shows an error for a bad password", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com", "wrong-password");
    await expect(page.getByRole("alert")).toContainText(/invalid|password/i);
  });

  test("opens the till after a shop admin signs in", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.getByRole("heading", { name: "Takeaway" })).toBeVisible();
  });

  test("puts each till screen on its own URL", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sales" }).click();
    await expect(page).toHaveURL(/\/sales$/);
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Items sold" }).click();
    await expect(page).toHaveURL(/\/items$/);
  });

  test("signs out back to the login card", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await page.locator("header").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
