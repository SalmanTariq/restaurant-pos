import type { MenuItem, TillSnapshot } from "./pos-types";

export const CATALOG_OFFLINE_ERROR =
  "Connect to the internet to change the menu, settings, floor, or staff list.";

function overlayStockAndPhotos(remote: MenuItem[], local: MenuItem[]): MenuItem[] {
  const localById = new Map(local.map((item) => [item.id, item]));
  return remote.map((item) => {
    const fromLocal = localById.get(item.id);
    return {
      ...item,
      stock: fromLocal ? fromLocal.stock : item.stock,
      imageDataUrl: item.imageDataUrl || fromLocal?.imageDataUrl || null,
    };
  });
}

/** Server owns catalog. Local keeps tickets, expenses, the open day, and stock from sales. */
export function snapshotWithLocalTillWork(
  local: TillSnapshot,
  remote: TillSnapshot,
): TillSnapshot {
  return {
    ...remote,
    orders: local.orders,
    expenses: local.expenses,
    days: local.days,
    nextToken: Math.max(local.nextToken || 1, remote.nextToken || 1),
    menu: overlayStockAndPhotos(remote.menu, local.menu),
  };
}
