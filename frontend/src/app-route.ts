import { useCallback, useEffect, useState } from "react";
import type { Screen } from "./pos-types";

const SCREENS: Screen[] = [
  "order",
  "tables",
  "orders",
  "sales",
  "expenses",
  "balance",
  "inventory",
  "categories",
  "users",
  "settings",
];

const ADMIN_SCREENS: Screen[] = [
  "inventory",
  "categories",
  "users",
  "settings",
];

export function isScreen(value: string): value is Screen {
  return SCREENS.includes(value as Screen);
}

export function parseAppPath(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  const clean =
    pathname.replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const screen: Screen = first && isScreen(first) ? first : "order";
  let ticketId = params.get("ticket");
  if (screen === "orders" && parts[1]) {
    ticketId = decodeURIComponent(parts[1]);
  }
  return { screen, ticketId };
}

export function pathFor(screen: Screen, ticketId?: string | null) {
  if (screen === "orders" && ticketId) {
    return `/orders?ticket=${encodeURIComponent(ticketId)}`;
  }
  return `/${screen}`;
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

export function useShopRoute(role?: string | null) {
  const read = useCallback(() => {
    const parsed = parseAppPath();
    if (role !== "admin" && ADMIN_SCREENS.includes(parsed.screen)) {
      return { screen: "order" as const, ticketId: null as string | null };
    }
    return parsed;
  }, [role]);

  const [route, setRoute] = useState(read);

  const go = useCallback(
    (screen: Screen, ticketId?: string | null, replace = false) => {
      let next = screen;
      if (role !== "admin" && ADMIN_SCREENS.includes(next)) next = "order";
      const ticket = next === "orders" ? ticketId ?? null : null;
      const path = pathFor(next, ticket);
      if (currentPath() !== path) {
        window.history[replace ? "replaceState" : "pushState"]({}, "", path);
      }
      setRoute({ screen: next, ticketId: ticket });
    },
    [role],
  );

  useEffect(() => {
    const parsed = read();
    const canonical = pathFor(parsed.screen, parsed.ticketId);
    if (currentPath() !== canonical) {
      window.history.replaceState({}, "", canonical);
    }
    setRoute(parsed);
    function onPop() {
      setRoute(read());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  return {
    screen: route.screen,
    ticketId: route.ticketId,
    go,
  };
}
