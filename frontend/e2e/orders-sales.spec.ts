import { expect, test } from "@playwright/test";
import { mockApi, signIn } from "./helpers";

test.describe("paid orders", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
  });

  test("shows paid tickets on Orders and offers a bill reprint", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("tab", { name: /Paid/ }).click();
    await expect(page.getByRole("heading", { name: "Token 7" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Print kitchen/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Print bill/ })).toBeVisible();
  });

  test("deletes a paid dummy ticket from Orders", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("tab", { name: /Paid/ }).click();
    await expect(page.getByRole("heading", { name: "Token 7" })).toBeVisible();
    await page.getByRole("button", { name: /Delete order/ }).click();
    await expect(page.getByRole("heading", { name: "Delete token 7?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete token 7" }).click();
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await expect(page.getByText("No tickets yet.")).toBeVisible();
  });

  test("opens a past sale from Sales and prints the bill", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sales" }).click();
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "#7" })).toBeVisible();
    await page.getByRole("button", { name: "Print bill" }).first().click();
    await page.getByRole("cell", { name: "#7" }).click();
    await expect(page.getByRole("heading", { name: "Token 7" })).toBeVisible();
    await expect(page.locator(".sales-page").getByText("Tandoori Roti", { exact: true })).toBeVisible();
  });

  test("hides a paid ticket outside the selected time window", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sales" }).click();
    await expect(page.getByRole("cell", { name: "#7" })).toBeVisible();
    await page.getByLabel("To time").fill("08:00");
    await expect(page.getByRole("cell", { name: "#7" })).toHaveCount(0);
  });

  test("lists how many of each item sold", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Items sold" }).click();
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.getByRole("heading", { name: "Items sold" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Tandoori Roti" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "4" })).toBeVisible();
  });
});

test.describe("expenses and balance", () => {
  test("records an expense and shows it on the balance sheet", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Expenses" }).click();
    await page.getByLabel("Title").fill("Onions");
    await page.getByLabel("Amount (Rs)").fill("250");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByText("Onions")).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Balance" }).click();
    await expect(page.getByRole("heading", { name: /Balance/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Labor wages")).toBeVisible();
    await expect(page.getByText("Rs 250").first()).toBeVisible();
  });

  test("edits and deletes an expense", async ({ page }) => {
    await mockApi(page);
    await signIn(page, "owner@test.com");
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Expenses" }).click();
    await page.getByLabel("Title").fill("Onions");
    await page.getByLabel("Amount (Rs)").fill("250");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.getByRole("button", { name: "Edit Onions" }).click();
    await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
    await page.getByLabel("Title").fill("Red onions");
    await page.getByLabel("Amount (Rs)").fill("300");
    await page.getByRole("button", { name: "Update expense" }).click();
    await expect(page.getByRole("cell", { name: "Red onions", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Rs 300/ })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("row", { name: /Red onions/ }).getByRole("button", { name: "Delete Red onions" }).click();
    await expect(page.getByRole("cell", { name: "Red onions", exact: true })).toHaveCount(0);
  });
});
