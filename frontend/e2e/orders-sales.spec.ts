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

  test("opens a past sale from Sales and prints the bill", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Sales" }).click();
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "#7" })).toBeVisible();
    await page.getByRole("button", { name: "Print bill" }).first().click();
    await page.getByRole("cell", { name: "#7" }).click();
    await expect(page.getByRole("heading", { name: "Token 7" })).toBeVisible();
    await expect(page.getByText("Tandoori Roti", { exact: true })).toBeVisible();
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
});
