import type { Collection, TillPatch } from "./till-patch";
import { applyPatch } from "./till-patch";
import { ApiError } from "./api";
import type { CartLine, PosOrder, TillSnapshot } from "./pos-types";

export type TillConflict = {
  collection: string;
  key: string;
  current: unknown;
  before: unknown;
  after: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseTillConflict(error: unknown): TillConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const nested = asRecord(error.body?.message) ?? error.body;
  if (!nested) return null;
  const collection = nested.collection;
  const key = nested.key;
  if (typeof collection !== "string" || typeof key !== "string") return null;
  return {
    collection,
    key,
    current: nested.current,
    before: nested.before,
    after: nested.after,
  };
}

export function applyConflictRow(
  snapshot: TillSnapshot,
  conflict: TillConflict,
): TillSnapshot {
  return applyPatch(snapshot, {
    changes: [
      {
        collection: conflict.collection as Collection,
        key: conflict.key,
        before: null,
        after: conflict.current,
      },
    ],
  });
}

export function rebaseConflict(
  patch: TillPatch,
  conflict: TillConflict,
  keep: "local" | "server",
): TillPatch {
  if (keep === "local") {
    return {
      ...patch,
      changes: patch.changes.map((change) =>
        change.collection === conflict.collection && change.key === conflict.key
          ? { ...change, before: conflict.current }
          : change,
      ),
    };
  }
  return {
    ...patch,
    changes: patch.changes.filter(
      (change) =>
        !(change.collection === conflict.collection && change.key === conflict.key),
    ),
  };
}

function money(value: number) {
  return `Rs ${value.toLocaleString("en-PK")}`;
}

export function describeConflictCopy(value: unknown): { heading: string; detail: string } {
  if (value == null) {
    return { heading: "Ticket removed", detail: "This copy deletes the order." };
  }
  const order = value as Partial<PosOrder>;
  if (typeof order.token === "number") {
    const lines = (order.lines ?? [])
      .map((line: CartLine) => `${line.qty}× ${line.name}`)
      .join(", ");
    const total = (order.lines ?? []).reduce(
      (sum, line) => sum + line.price * line.qty,
      0,
    );
    const bits = [
      order.status ?? "open",
      order.payment ? String(order.payment) : null,
      order.time,
      lines || "No items",
      money(total),
    ].filter(Boolean);
    return { heading: `Token ${order.token}`, detail: bits.join(" · ") };
  }
  return { heading: "This copy", detail: JSON.stringify(value) };
}
