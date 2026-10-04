import type { TillSnapshot } from "./till-snapshot";

export const rowCollections = ["menu", "orders", "expenses", "staff", "days"] as const;
export type Collection = typeof rowCollections[number] | "settings" | "layout" | "categories" | "nextToken";
export type TillChange = { collection: Collection; key: string; before: unknown; after: unknown };
export type TillPatch = { changes: TillChange[]; submitted?: { changes: TillChange[] } };

export function rowKey(collection: string, row: any): string {
  return collection === "days" ? row.date : row.id;
}

// Match wire values, excluding cash-dialog state that is never stored by the API.
export function wireRow(collection: string, value: any): any {
  if (value == null) return null;
  if (collection === "orders") {
    const { id, token, type, tableId, date, time, status, payment, paidAt, lines } = value;
    return { id, token, type, tableId, date, time, status, payment, paidAt,
      lines: [...lines].sort((a, b) => a.id.localeCompare(b.id)) };
  }
  if (collection === "menu") return { ...value, nameUrdu: value.nameUrdu || "", imageDataUrl: value.imageDataUrl || null };
  if (collection === "days") return { ...value, closedAt: value.closedAt || null };
  return value;
}

export function stable(value: any): string {
  function canonical(entry: any): any {
    if (Array.isArray(entry)) return entry.map(canonical);
    if (entry && typeof entry === "object") return Object.fromEntries(
      Object.keys(entry).sort().filter(key => entry[key] !== undefined)
        .map(key => [key, canonical(entry[key])]),
    );
    return entry;
  }
  return JSON.stringify(canonical(value));
}

export function sameRow(collection: string, a: unknown, b: unknown): boolean {
  const comparable = (value: any) => {
    const row = wireRow(collection, value);
    // MySQL business-day timestamps have second precision.
    if (collection === "days" && row) return { ...row,
      openedAt: new Date(row.openedAt).toISOString().replace(/\.\d{3}Z$/, "Z"),
      closedAt: row.closedAt ? new Date(row.closedAt).toISOString().replace(/\.\d{3}Z$/, "Z") : null };
    if (collection === "orders" && row?.paidAt) return { ...row,
      paidAt: new Date(row.paidAt).toISOString().replace(/\.\d{3}Z$/, "Z") };
    return row;
  };
  return stable(comparable(a)) === stable(comparable(b));
}

export function diffTill(base: TillSnapshot, next: TillSnapshot): TillPatch {
  const changes: TillChange[] = [];
  for (const collection of rowCollections) {
    const before = new Map(base[collection].map(row => [rowKey(collection, row), wireRow(collection, row)]));
    const after = new Map(next[collection].map(row => [rowKey(collection, row), wireRow(collection, row)]));
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(key) ?? null, b = after.get(key) ?? null;
      if (!sameRow(collection, a, b)) changes.push({ collection, key, before: a, after: b });
    }
  }
  for (const collection of ["settings", "layout", "categories", "nextToken"] as const) {
    if (stable(base[collection]) !== stable(next[collection])) changes.push({ collection, key: collection,
      before: base[collection], after: next[collection] });
  }
  return { changes };
}

export function applyPatch(snapshot: TillSnapshot, patch: TillPatch, side: "before" | "after" = "after"): TillSnapshot {
  const next = structuredClone(snapshot);
  for (const change of patch.changes) {
    const value = change[side];
    if ((rowCollections as readonly string[]).includes(change.collection)) {
      const collection = change.collection as typeof rowCollections[number];
      const rows: any[] = next[collection];
      const index = rows.findIndex(row => rowKey(collection, row) === change.key);
      if (index >= 0) rows.splice(index, 1);
      if (value != null) rows.unshift(structuredClone(value));
    } else (next as any)[change.collection] = structuredClone(value);
  }
  return next;
}
