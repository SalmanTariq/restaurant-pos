import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./helpers";

test.describe("inventory", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Inventory" }).click();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  test("lists dishes with prices", async ({ page }) => {
    await expect(page.getByText("Chicken Karahi (Half)")).toBeVisible();
    await expect(page.getByText("Rs 950").or(page.getByText("950"))).toBeVisible();
  });

  test("deletes a dish from the menu", async ({ page }) => {
    await page.getByRole("button", { name: "Delete Tandoori Roti" }).click();
    await expect(page.getByRole("heading", { name: "Delete this dish?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete Tandoori Roti" }).click();
    await expect(page.getByText("Tandoori Roti")).toHaveCount(0);
  });

  test("adds a dish to the menu", async ({ page }) => {
    await page.getByLabel("Name").fill("Seekh Kabab");
    await page.getByLabel("Category", { exact: true }).selectOption("Karahi");
    await page.getByLabel("Sale price (Rs)").fill("380");
    await page.getByRole("button", { name: "Add to menu" }).click();
    await expect(page.getByText("Seekh Kabab")).toBeVisible();
  });
});

test.describe("categories", () => {
  test("adds a menu group used on Order", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Categories" }).click();
    await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
    await page.getByLabel("Name").fill("Dessert");
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByText("Dessert")).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Order", exact: true }).click();
    await expect(page.locator('[data-cat-nav="Dessert"]')).toBeVisible();
  });
});
