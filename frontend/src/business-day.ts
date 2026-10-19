import { clockToMinutes, defaultReportRange } from "./demo-data";
import type { PosOrder } from "./pos-types";

function dateISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function businessDayDate(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  if ((clockToMinutes(time) ?? 600) < 600) start.setDate(start.getDate() - 1);
  return dateISO(start);
}

export function currentBusinessDay(now = new Date()) {
  return businessDayDate(dateISO(now), `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
}

export function businessDayRange(now = new Date()) {
  return defaultReportRange(now);
}

export function nextTokenForDay(orders: PosOrder[], day = currentBusinessDay()) {
  return orders.reduce((next, order) => businessDayDate(order.date, order.time) === day
    ? Math.max(next, order.token + 1) : next, 1);
}

/** Give unsaved local tickets the next free token. Remote tickets stay on the server. */
export function reassignTakenTokens(local: PosOrder[], remote: PosOrder[], taken: number) {
  const remoteIds = new Set(remote.map((order) => order.id));
  const orders = local.map((order) => ({ ...order }));
  const conflicts = orders.filter((order) => order.token === taken && !remoteIds.has(order.id));
  if (conflicts.length === 0) {
    return { orders: local, nextToken: nextTokenForDay([...remote, ...local]), changed: false, assigned: [] as number[] };
  }
  const assigned: number[] = [];
  for (const order of conflicts) {
    const day = businessDayDate(order.date, order.time);
    const others = [...remote, ...orders.filter((entry) => entry.id !== order.id)];
    order.token = nextTokenForDay(others, day);
    assigned.push(order.token);
  }
  return { orders, nextToken: nextTokenForDay([...remote, ...orders]), changed: true, assigned };
}
