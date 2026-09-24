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

  test("adds a dish to the ticket and pays it", async ({ page }) => {
    await page.getByRole("button", { name: /Chicken Karahi/ }).click();
    await expect(page.locator(".ticket-lines")).toContainText("Chicken Karahi");
    await page.getByLabel("Quantity for Chicken Karahi (Half)").fill("5");
    await expect(page.getByLabel("Quantity for Chicken Karahi (Half)")).toHaveValue("5");
    await expect(page.getByRole("button", { name: /Send to orders/ })).toBeDisabled();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page.getByLabel("Print bill")).toBeChecked();
    await page.getByRole("button", { name: /^Cash/ }).click();
    await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("tab", { name: /Paid/ }).click();
    await expect(page.getByRole("heading", { name: "Token 8" })).toBeVisible();
  });

  test("opens dine-in tables from the order type toggle", async ({ page }) => {
    await page.getByRole("button", { name: /Dine-in/ }).click();
    await expect(page.getByRole("heading", { name: "Floor" })).toBeVisible();
  });

  test("hides tables when dine-in is turned off in settings", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Show tables and dine-in").uncheck();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Order", exact: true }).click();
    await expect(page.getByRole("button", { name: /Dine-in/ })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Tables" }),
    ).toHaveCount(0);
  });

  test("takes cash and keeps the paid ticket on Orders", async ({ page }) => {
    await page.getByRole("button", { name: /Tandoori Roti/ }).click();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page.getByRole("heading", { name: "Take payment" })).toBeVisible();
    await expect(page.getByLabel("Print bill")).toBeChecked();
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
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.getByRole("button", { name: /^Cash/ }).click();
    await expect(page.getByRole("alert")).toContainText("Database write failed");
  });
});

test.describe("cashier till", () => {
  test("hides inventory and settings", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "cashier@test.com");
    await waitForTill(page);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Items sold" }),
    ).toHaveCount(0);
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
          useTables: true,
        },
      }),
    });
    await signIn(page, "owner@test.com");
    await expect(page.getByRole("heading", { name: "Petty cash" })).toBeVisible();
    await page.getByLabel("Opening cash (Rs)").fill("1500");
    await page.getByRole("button", { name: /Open the day/ }).click();
    await waitForTill(page);
  });

  test("keeps an overnight till on the open business day", async ({ page }) => {
    const opened = new Date();
    opened.setDate(opened.getDate() - 1);
    const month = String(opened.getMonth() + 1).padStart(2, "0");
    const day = String(opened.getDate()).padStart(2, "0");
    const businessDate = `${opened.getFullYear()}-${month}-${day}`;
    await mockApi(page, {
      till: sampleTill({
        days: [
          {
            date: businessDate,
            openedAt: opened.toISOString(),
            pettyCash: 2000,
            openedBy: "Ayesha",
          },
        ],
      }),
    });
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    await expect(page.locator("header")).toContainText(businessDate);
  });

  test("End day closes the till until it is opened again", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await waitForTill(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("header").getByRole("button", { name: /End day/ }).click();
    await expect(page.getByRole("heading", { name: "Open the till" })).toBeVisible();
    await page.getByRole("button", { name: /Open the day/ }).click();
    await waitForTill(page);
  });
});
