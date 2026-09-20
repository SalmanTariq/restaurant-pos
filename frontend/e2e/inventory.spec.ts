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

  test("edits a dish after a reorder drag", async ({ page }) => {
    const grip = page.getByRole("button", { name: /Move Chicken Karahi/ });
    const box = await grip.boundingBox();
    if (!box) throw new Error("missing drag handle");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30);
    await page.mouse.up();
    await page.getByRole("button", { name: "Edit Chicken Karahi (Half)" }).click();
    await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
    await page.getByLabel("Name").fill("Chicken Karahi Full Plate");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Chicken Karahi Full Plate")).toBeVisible();
  });

  test("adds a dish with a long name and keeps it after reload", async ({ page }) => {
    const name = "Special Chicken Karahi Half Plate With Extra Ginger";
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Category", { exact: true }).selectOption("Karahi");
    await page.getByLabel("Sale price (Rs)").fill("380");
    const saved = page.waitForResponse((response) => {
      if (!response.url().includes("/till") || response.request().method() !== "PUT") {
        return false;
      }
      return Boolean(response.request().postData()?.includes(name));
    });
    await page.getByRole("button", { name: "Add to menu" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await saved;
    await page.reload();
    await expect(page.locator('[data-cat-nav="Karahi"]')).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Inventory" }).click();
    await expect(page.getByText(name)).toBeVisible();
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
