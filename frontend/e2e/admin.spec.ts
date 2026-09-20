import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./helpers";

test.describe("settings and users", () => {
  test("saves the restaurant name", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Name").fill("New Kitchen");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Name saved")).toBeVisible();
  });

  test("creates a cashier from Users", async ({ page }) => {
    await mockApi(page, {
      staff: [{ id: "u-owner", name: "Ayesha", email: "owner@test.com", role: "admin" }],
    });
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Users" }).click();
    await page.getByLabel("Name").fill("Sana");
    await page.getByLabel("Email").fill("sana@test.com");
    await page.getByLabel("Password").fill("cashier99");
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText("Sana", { exact: true })).toBeVisible();
    await expect(page.getByText("sana@test.com")).toBeVisible();
  });
});

test.describe("platform control panel", () => {
  test("lists shops and creates a restaurant", async ({ page }) => {
    await mockApi(page, {
      shops: [
        {
          id: "shop-1",
          name: "Old Kitchen",
          status: "active",
          ownerEmail: "old@test.com",
          lastLoginAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    await signIn(page, "platform@test.com");
    await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible();
    await expect(page.getByText("Old Kitchen")).toBeVisible();
    await page.getByLabel(/Restaurant name|Name/).first().fill("Third Kitchen");
    await page.getByLabel("Owner name").fill("Omar");
    await page.getByLabel("Owner email").fill("omar@test.com");
    await page.getByLabel("Owner password").fill("password1234");
    await page.getByRole("button", { name: /Create/ }).click();
    await expect(page.getByText("Third Kitchen")).toBeVisible();
  });
});
