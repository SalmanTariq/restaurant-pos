import type { DayOpen, ExpenseRow, PosOrder, TillSnapshot } from "./pos-types";
import { applyPatch, sameRow, type TillPatch } from "./till-patch";

/** Old snapshots have no base; migrate additions without overwriting existing records. */
export function migrateLegacyTill(local: TillSnapshot, remote: TillSnapshot): TillSnapshot {
  const additions: TillPatch = { changes: [] };
  const newPaidOrders: PosOrder[] = [];
  for (const collection of ["orders", "expenses", "days"] as const) {
    const remoteByKey = new Map(remote[collection].map(row => [
      collection === "days" ? (row as DayOpen).date : (row as PosOrder | ExpenseRow).id, row,
    ]));
    for (const row of local[collection]) {
      const key = collection === "days" ? (row as DayOpen).date : (row as PosOrder | ExpenseRow).id;
      const existing = remoteByKey.get(key);
      // paidAt was not part of the old client snapshot. Its absence is not an
      // edit: retain the database timestamp rather than comparing it to nothing.
      const comparable = collection === "orders" && !(row as PosOrder).paidAt && existing
        ? { ...row, paidAt: (existing as PosOrder).paidAt }
        : row;
      if (existing && !sameRow(collection, existing, comparable)) {
        throw new Error(`Unsynced ${collection} ${key} from the previous app version needs review. Local records have been retained; they will not overwrite server records.`);
      }
      if (!existing) {
        additions.changes.push({ collection, key, before: null, after: row });
        if (collection === "orders" && (row as PosOrder).status === "paid") newPaidOrders.push(row as PosOrder);
      }
    }
  }
  if (local.settings.useInventory) {
    const consumed = new Map<string, number>();
    for (const order of newPaidOrders) for (const line of order.lines) {
      consumed.set(line.id, (consumed.get(line.id) || 0) + line.qty);
    }
    for (const item of local.menu) {
      const existing = remote.menu.find(row => row.id === item.id);
      if (!existing || item.stock === existing.stock) continue;
      const used = consumed.get(item.id) || 0;
      if (!used || item.stock !== Math.max(0, existing.stock - used)) {
        throw new Error(`Unsynced stock for ${item.name} from the previous app version needs review. Local records have been retained.`);
      }
      additions.changes.push({ collection: "menu", key: item.id, before: existing,
        after: { ...existing, stock: item.stock } });
    }
  }
  const recovered = applyPatch(remote, additions);
  recovered.nextToken = Math.max(remote.nextToken, local.nextToken);
  return recovered;
}
