import type { DayOpen, ExpenseRow, PosOrder, TillSnapshot } from "./pos-types";
import { applyPatch, sameRow, stable, wireRow, type TillPatch } from "./till-patch";

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
      let comparable = collection === "orders" && !(row as PosOrder).paidAt && existing
        ? { ...row, paidAt: (existing as PosOrder).paidAt }
        : row;
      if (collection === "orders" && existing) {
        const deviceOrder = comparable as PosOrder;
        const serverOrder = existing as PosOrder;
        const stamp = /^ord-(\d{13})(?:-|$)/.exec(key);
        if (stamp && deviceOrder.date !== serverOrder.date) {
          const created = new Date(Number(stamp[1]));
          const calendarDate = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
          // An old open till could backdate the cached order. Accept the
          // server's corrected creation date only if every other field agrees.
          const corrected = { ...deviceOrder, date: serverOrder.date };
          if (serverOrder.date === calendarDate && sameRow(collection, corrected, serverOrder)) {
            comparable = corrected;
          }
        }
      }
      if (existing && !sameRow(collection, existing, comparable)) {
        const device = wireRow(collection, comparable);
        const server = wireRow(collection, existing);
        const differences = [...new Set([...Object.keys(device), ...Object.keys(server)])]
          .filter(field => stable(device[field]) !== stable(server[field]))
          .map(field => `${field}: device ${JSON.stringify(device[field]) ?? "missing"}; server ${JSON.stringify(server[field]) ?? "missing"}`);
        throw new Error(`Unsynced ${collection} ${key} from the previous app version needs review. ${differences.join(". ")}. Local records have been retained; they will not overwrite server records.`);
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
