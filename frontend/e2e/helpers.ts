import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:3000";

export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "cashier" | "platform";
  restaurantId?: string | null;
};

export function shopUser(
  role: "admin" | "cashier" = "admin",
): MockUser {
  return {
    id: "user-1",
    name: role === "admin" ? "Ayesha" : "Bilal",
    email: role === "admin" ? "owner@test.com" : "cashier@test.com",
    role,
    restaurantId: "shop-1",
  };
}

export function platformUser(): MockUser {
  return {
    id: "plat-1",
    name: "Platform",
    email: "platform@test.com",
    role: "platform",
    restaurantId: null,
  };
}

export function sampleTill(overrides: Record<string, unknown> = {}) {
  const date = todayISO();
  return {
    menu: [
      {
        id: "ck-half",
        name: "Chicken Karahi (Half)",
        category: "Karahi",
        price: 950,
        stock: 12,
        active: true,
        nameUrdu: "چکن کڑاہی (ہاف)",
        imageDataUrl: null,
      },
      {
        id: "roti",
        name: "Tandoori Roti",
        category: "Naan & Roti",
        price: 25,
        stock: 40,
        active: true,
        imageDataUrl: null,
      },
      {
        id: "chai",
        name: "Doodh Patti",
        category: "Drinks",
        price: 80,
        stock: 20,
        active: true,
        imageDataUrl: null,
      },
    ],
    orders: [
      {
        id: "ord-paid",
        token: 7,
        type: "takeaway",
        tableId: null,
        status: "paid",
        payment: "cash",
        date,
        time: "1:10 PM",
        lines: [
          { id: "roti", name: "Tandoori Roti", price: 25, qty: 4 },
        ],
      },
    ],
    nextToken: 8,
    expenses: [
      {
        id: "exp-1",
        title: "Gas",
        category: "Utilities",
        amount: 400,
        date,
        notes: "",
      },
    ],
    staff: [{ id: "staff-1", name: "Ali", dailyWage: 1200 }],
    days: [
      {
        date,
        openedAt: new Date().toISOString(),
        pettyCash: 2000,
        openedBy: "Ayesha",
      },
    ],
    settings: {
      restaurantName: "Test Kitchen",
      logoDataUrl: null,
      requirePettyCash: false,
      useInventory: true,
    },
    layout: [
      { id: "T1", x: 8, y: 24, w: 124, h: 124, shape: "round", kind: "table" },
    ],
    categories: ["Karahi", "Naan & Roti", "Drinks"],
    ...overrides,
  };
}

function sessionPayload(user: MockUser | null) {
  if (!user) return null;
  return {
    session: {
      id: "sess-1",
      userId: user.id,
      token: "tok",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    user: {
      ...user,
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

export async function mockApi(
  page: Page,
  options: {
    user?: MockUser | null;
    till?: Record<string, unknown>;
    failTillPut?: boolean;
    staff?: Array<{ id: string; name: string; email: string; role: string }>;
    shops?: unknown[];
  } = {},
) {
  let user = options.user === undefined ? null : options.user;
  const till = options.till ?? sampleTill();
  const staff = options.staff ?? [];
  const shops = options.shops ?? [];

  await page.addInitScript(() => {
    window.print = () => {};
    window.open = () => null;
  });

  await page.route(/https?:\/\/(localhost|127\.0\.0\.1):3000\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path.includes("/get-session") || path.endsWith("/api/auth/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionPayload(user)),
      });
      return;
    }

    if (path.includes("/api/auth/sign-in/email") && method === "POST") {
      const body = request.postDataJSON() as { email?: string; password?: string };
      if (body.password === "wrong-password") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Invalid email or password",
            code: "INVALID_EMAIL_OR_PASSWORD",
          }),
        });
        return;
      }
      user =
        body.email?.includes("platform")
          ? platformUser()
          : body.email?.includes("cashier")
            ? shopUser("cashier")
            : shopUser("admin");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-auth-token": "tok" },
        body: JSON.stringify({
          redirect: false,
          token: "tok",
          user,
        }),
      });
      return;
    }

    if (path.includes("/api/auth/sign-out")) {
      user = null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (path === "/till" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(till),
      });
      return;
    }

    if (path === "/till" && method === "PUT") {
      if (options.failTillPut) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Database write failed" }),
        });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      Object.assign(till, body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(till),
      });
      return;
    }

    if (path === "/staff" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ users: staff }),
      });
      return;
    }

    if (path === "/staff" && method === "POST") {
      const body = request.postDataJSON() as {
        name: string;
        email: string;
        role?: string;
      };
      staff.push({
        id: `u-${staff.length + 1}`,
        name: body.name,
        email: body.email,
        role: body.role ?? "cashier",
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(staff[staff.length - 1]),
      });
      return;
    }

    if (path === "/platform/restaurants" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shops),
      });
      return;
    }

    if (path === "/platform/restaurants" && method === "POST") {
      const body = request.postDataJSON() as { name: string; ownerEmail: string };
      const shop = {
        id: "shop-new",
        name: body.name,
        status: "active",
        ownerEmail: body.ownerEmail,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      };
      (shops as unknown[]).push(shop);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(shop),
      });
      return;
    }

    if (path.includes("/api/auth/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionPayload(user)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

export async function signIn(page: Page, email: string, password = "password1234") {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export function categoryTab(page: Page, name: string) {
  return page.locator(`[data-cat-nav="${name}"]`);
}

export async function waitForTill(page: Page) {
  await expect(categoryTab(page, "Karahi")).toBeVisible();
}
