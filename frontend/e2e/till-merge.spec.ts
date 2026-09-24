import { expect, test } from "@playwright/test";
import { snapshotWithLocalTillWork } from "../src/till-merge";
import type { MenuItem, TillSnapshot } from "../src/pos-types";

function item(partial: Partial<MenuItem> & Pick<MenuItem, "id" | "name">): MenuItem {
  return {
    category: "Karahi",
    price: 100,
    stock: 10,
    active: true,
    imageDataUrl: null,
    nameUrdu: "",
    ...partial,
  };
}

function till(partial: Partial<TillSnapshot> = {}): TillSnapshot {
  return {
    menu: [],
    orders: [],
    nextToken: 1,
    expenses: [],
    staff: [],
    days: [],
    settings: {
      restaurantName: "Remote Kitchen",
      logoDataUrl: null,
      requirePettyCash: true,
      useInventory: true,
      useTables: true,
    },
    layout: [],
    categories: ["Karahi"],
    ...partial,
  };
}

test.describe("till merge", () => {
  test("keeps server photos and names when local cache stripped the menu", () => {
    const photo = "data:image/jpeg;base64,abc";
    const local = till({
      menu: [item({ id: "roti", name: "Roti", stock: 7, imageDataUrl: null })],
      orders: [
        {
          id: "ord-1",
          token: 3,
          type: "takeaway",
          tableId: null,
          lines: [{ id: "roti", name: "Roti", price: 25, qty: 1 }],
          status: "paid",
          date: "2026-09-24",
          time: "1:00 PM",
        },
      ],
      nextToken: 4,
      expenses: [
        {
          id: "exp-1",
          title: "Gas",
          category: "Gas",
          amount: 400,
          date: "2026-09-24",
          notes: "",
        },
      ],
      staff: [{ id: "staff-local", name: "Unsynced", dailyWage: 1 }],
      settings: {
        restaurantName: "Stale till",
        logoDataUrl: null,
        requirePettyCash: false,
        useInventory: false,
        useTables: false,
      },
    });
    const remote = till({
      menu: [item({ id: "roti", name: "Tandoori Roti", stock: 10, imageDataUrl: photo })],
      staff: [{ id: "staff-1", name: "Ali", dailyWage: 1200 }],
      nextToken: 2,
      categories: ["Karahi", "Naan & Roti"],
    });

    const merged = snapshotWithLocalTillWork(local, remote);

    expect(merged.menu).toEqual([
      item({ id: "roti", name: "Tandoori Roti", stock: 7, imageDataUrl: photo }),
    ]);
    expect(merged.orders).toEqual(local.orders);
    expect(merged.expenses).toEqual(local.expenses);
    expect(merged.nextToken).toBe(4);
    expect(merged.staff).toEqual(remote.staff);
    expect(merged.settings.restaurantName).toBe("Remote Kitchen");
    expect(merged.categories).toEqual(remote.categories);
  });

  test("does not add dishes that exist only in the local cache", () => {
    const local = till({
      menu: [item({ id: "ghost", name: "Ghost dish", stock: 3 })],
    });
    const remote = till({
      menu: [item({ id: "roti", name: "Roti", stock: 10 })],
    });
    const merged = snapshotWithLocalTillWork(local, remote);
    expect(merged.menu.map((row) => row.id)).toEqual(["roti"]);
  });
});
