import { clockToMinutes } from "./demo-data";
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
  const from = currentBusinessDay(now);
  const [year, month, day] = from.split("-").map(Number);
  return { from, to: dateISO(new Date(year, month - 1, day + 1)), fromTime: "10:00", toTime: "03:00" };
}

export function nextTokenForDay(orders: PosOrder[], day = currentBusinessDay()) {
  return orders.reduce((next, order) => businessDayDate(order.date, order.time) === day
    ? Math.max(next, order.token + 1) : next, 1);
}
