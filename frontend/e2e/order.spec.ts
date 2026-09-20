import { expect, test } from "@playwright/test";
import { categoryTab, mockApi, sampleTill, signIn, waitForTill } from "./helpers";

test.describe("order till", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await waitForTill(page);
  });

  test("lists every category and jumps to a section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Karahi" })).toBeVisible();
    await expect(page.getByText("چکن کڑاہی (ہاف)")).toBeVisible();
    await categoryTab(page, "Drinks").click();
    await expect(page.getByRole("heading", { name: "Drinks" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Doodh Patti/ })).toBeVisible();
  });

  test("adds a dish to the ticket and sends it to orders", async ({ page }) => {
    await page.getByRole("button", { name: /Chicken Karahi/ }).click();
    await expect(page.locator(".ticket-lines")).toContainText("Chicken Karahi");
    await page.getByLabel("Quantity for Chicken Karahi (Half)").fill("5");
    await expect(page.getByLabel("Quantity for Chicken Karahi (Half)")).toHaveValue("5");
    await page.getByRole("button", { name: /Send to orders/ }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("heading", { name: "Token 8" })).toBeVisible();
    await expect(page.getByLabel("Quantity for Chicken Karahi (Half)")).toHaveValue("5");
    await expect(page.getByRole("button", { name: /Print kitchen/ })).toBeVisible();
  });

  test("opens dine-in tables from the order type toggle", async ({ page }) => {
    await page.getByRole("button", { name: /Dine-in/ }).click();
    await expect(page.getByRole("heading", { name: "Floor" })).toBeVisible();
  });

  test("takes cash and keeps the paid ticket on Orders", async ({ page }) => {
    await page.getByRole("button", { name: /Tandoori Roti/ }).click();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page.getByRole("heading", { name: "Take payment" })).toBeVisible();
    await page.getByRole("button", { name: /^Cash/ }).click();
    await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("tab", { name: /Paid/ }).click();
    await expect(page.getByRole("heading", { name: "Token 8" })).toBeVisible();
  });
});

test.describe("till save errors", () => {
  test("shows an error when the till cannot be saved online", async ({ page }) => {
    await mockApi(page, { failTillPut: true });
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await page.getByRole("button", { name: /Tandoori Roti/ }).click();
    await page.getByRole("button", { name: /Send to orders/ }).click();
    await expect(page.getByRole("alert")).toContainText("Database write failed");
  });
});

test.describe("cashier till", () => {
  test("hides inventory and settings", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "cashier@test.com");
    await waitForTill(page);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Inventory" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }),
    ).toHaveCount(0);
  });
});

test.describe("day start", () => {
  test("asks for petty cash when the drawer must be counted", async ({ page }) => {
    await mockApi(page, {
      till: sampleTill({
        days: [],
        settings: {
          restaurantName: "Test Kitchen",
          logoDataUrl: null,
          requirePettyCash: true,
          useInventory: true,
        },
      }),
    });
    await signIn(page, "owner@test.com");
    await expect(page.getByRole("heading", { name: "Petty cash" })).toBeVisible();
    await page.getByLabel("Opening cash (Rs)").fill("1500");
    await page.getByRole("button", { name: /Open the day/ }).click();
    await waitForTill(page);
  });
});
