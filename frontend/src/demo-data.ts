import type {
  DiningTable,
  ExpenseRow,
  MenuItem,
  PosOrder,
  TableLayout,
  TokenTicket,
} from "./pos-types";
import { readTenantItem } from "./tenant-storage";

export { DEFAULT_MENU_CATEGORIES as CATEGORIES } from "./menu-categories";

export const MENU_ITEMS: MenuItem[] = [
  { id: "ck-half", name: "Chicken Karahi (Half)", nameUrdu: "چکن کڑاہی (ہاف)", category: "Karahi", price: 950, stock: 0, active: true },
  { id: "ck-full", name: "Chicken Karahi (Full)", nameUrdu: "چکن کڑاہی (فل)", category: "Karahi", price: 1800, stock: 0, active: true },
  { id: "mk-half", name: "Mutton Karahi (Half)", nameUrdu: "مٹن کڑاہی (ہاف)", category: "Karahi", price: 1450, stock: 0, active: true },
  { id: "mk-full", name: "Mutton Karahi (Full)", nameUrdu: "مٹن کڑاہی (فل)", category: "Karahi", price: 2700, stock: 0, active: true },
  { id: "daal", name: "Daal Fry", nameUrdu: "دال فرائی", category: "Karahi", price: 380, stock: 0, active: true },
  { id: "palak", name: "Palak Paneer", nameUrdu: "پالک پنیر", category: "Karahi", price: 520, stock: 0, active: true },
  { id: "roti", name: "Tandoori Roti", nameUrdu: "تندوری روٹی", category: "Naan & Roti", price: 25, stock: 0, active: true },
  { id: "naan", name: "Roghni Naan", nameUrdu: "روغنی نان", category: "Naan & Roti", price: 60, stock: 0, active: true },
  { id: "garlic", name: "Garlic Naan", nameUrdu: "گارلک نان", category: "Naan & Roti", price: 80, stock: 0, active: true },
  { id: "seekh", name: "Seekh Kabab", nameUrdu: "سیخ کباب", category: "BBQ", price: 380, stock: 0, active: true },
  { id: "malai", name: "Malai Boti", nameUrdu: "ملائی بوٹی", category: "BBQ", price: 420, stock: 0, active: true },
  { id: "biryani", name: "Chicken Biryani", nameUrdu: "چکن بریانی", category: "Rice", price: 380, stock: 0, active: true },
  { id: "pulao", name: "Yakhni Pulao", nameUrdu: "یخنی پلاؤ", category: "Rice", price: 340, stock: 0, active: true },
  { id: "lassi", name: "Fresh Lassi", nameUrdu: "لسی", category: "Drinks", price: 180, stock: 0, active: true },
  { id: "chai", name: "Doodh Patti", nameUrdu: "دودھ پتی", category: "Drinks", price: 80, stock: 0, active: true },
  { id: "raita", name: "Raita", nameUrdu: "رائتہ", category: "Sides", price: 90, stock: 0, active: true },
  { id: "salad", name: "Kachumber", nameUrdu: "کچومر", category: "Sides", price: 70, stock: 0, active: true },
];

export const DEFAULT_FLOOR: TableLayout[] = [
  { id: "T1", x: 8, y: 24, w: 124, h: 124, shape: "round" },
  { id: "T2", x: 8, y: 48, w: 124, h: 124, shape: "round" },
  { id: "T3", x: 8, y: 72, w: 124, h: 124, shape: "round" },
  { id: "T4", x: 28, y: 26, w: 128, h: 128, shape: "round" },
  { id: "T5", x: 46, y: 26, w: 128, h: 128, shape: "round" },
  { id: "T6", x: 64, y: 26, w: 128, h: 128, shape: "round" },
  { id: "T7", x: 28, y: 52, w: 128, h: 128, shape: "round" },
  { id: "T8", x: 46, y: 52, w: 128, h: 128, shape: "round" },
  { id: "T9", x: 64, y: 52, w: 128, h: 128, shape: "round" },
  { id: "T10", x: 84, y: 24, w: 132, h: 132, shape: "round" },
  { id: "T11", x: 84, y: 48, w: 132, h: 132, shape: "round" },
  { id: "T12", x: 84, y: 72, w: 132, h: 132, shape: "round" },
  { id: "counter", x: 50, y: 90, w: 128, h: 36, shape: "rect", kind: "counter" },
];

export const LAYOUT_KEY = "chulha_floor_plan";

const NEW_TABLE: Pick<TableLayout, "w" | "h" | "shape" | "kind"> = {
  w: 128,
  h: 128,
  shape: "round",
  kind: "table",
};

function asLayoutPiece(entry: TableLayout): TableLayout | null {
  if (!entry || typeof entry.id !== "string" || !entry.id) return null;
  const x = Number(entry.x);
  const y = Number(entry.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const base = DEFAULT_FLOOR.find((piece) => piece.id === entry.id);
  if (base) {
    return { ...base, x, y };
  }
  if (entry.kind === "counter") {
    return {
      id: entry.id,
      x,
      y,
      w: Number(entry.w) || 128,
      h: Number(entry.h) || 36,
      shape: "rect",
      kind: "counter",
    };
  }
  return {
    id: entry.id,
    x,
    y,
    w: Number(entry.w) || NEW_TABLE.w,
    h: Number(entry.h) || NEW_TABLE.h,
    shape: "round",
    kind: "table",
  };
}

export function loadLayout(restaurantId: string): TableLayout[] {
  try {
    const raw = readTenantItem(LAYOUT_KEY, restaurantId);
    if (!raw) return DEFAULT_FLOOR;
    const parsed = JSON.parse(raw) as TableLayout[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_FLOOR;
    const pieces = parsed
      .map(asLayoutPiece)
      .filter((piece): piece is TableLayout => piece !== null);
    return pieces.length > 0 ? pieces : DEFAULT_FLOOR;
  } catch {
    return DEFAULT_FLOOR;
  }
}

export function diningFromLayout(layout: TableLayout[]): DiningTable[] {
  return layout
    .filter((piece) => piece.kind !== "counter")
    .map((piece) => ({ id: piece.id, label: piece.id, status: "free" as const }));
}

export const TABLES: DiningTable[] = diningFromLayout(DEFAULT_FLOOR);

export const EXPENSE_CATEGORIES = [
  "Labor",
  "Grocery",
  "Gas",
  "Electricity",
  "Cleaning",
  "Other",
];

export const EXPENSES: ExpenseRow[] = [
  {
    id: "exp-1",
    title: "Evening kitchen staff",
    category: "Labor",
    amount: 2500,
    date: "2026-09-08",
    notes: "Two cooks",
  },
  {
    id: "exp-2",
    title: "Chicken and masala",
    category: "Grocery",
    amount: 1800,
    date: "2026-09-08",
    notes: "",
  },
  {
    id: "exp-3",
    title: "Tandoor gas refill",
    category: "Gas",
    amount: 900,
    date: "2026-09-08",
    notes: "",
  },
  {
    id: "exp-4",
    title: "Floor and dishes",
    category: "Cleaning",
    amount: 400,
    date: "2026-09-08",
    notes: "",
  },
  {
    id: "exp-5",
    title: "Parcel boxes",
    category: "Other",
    amount: 700,
    date: "2026-09-08",
    notes: "Takeaway packaging",
  },
  {
    id: "exp-6",
    title: "Wapda bill share",
    category: "Electricity",
    amount: 1200,
    date: "2026-09-07",
    notes: "Sunday night",
  },
  {
    id: "exp-7",
    title: "Onions and oil",
    category: "Grocery",
    amount: 950,
    date: "2026-09-06",
    notes: "",
  },
];

export const TOKENS: TokenTicket[] = [
  {
    id: "t47",
    number: 47,
    type: "takeaway",
    items: "Chicken Karahi (Half) × 1, Tandoori Roti × 4",
    total: 1050,
    time: "4:12 PM",
  },
  {
    id: "t46",
    number: 46,
    type: "dine-in",
    table: "T2",
    items: "Seekh Kabab × 2, Roghni Naan × 3",
    total: 940,
    time: "4:08 PM",
  },
  {
    id: "t45",
    number: 45,
    type: "takeaway",
    items: "Chicken Biryani × 2, Fresh Lassi × 2",
    total: 1120,
    time: "4:03 PM",
  },
];

export function rupees(amount: number) {
  return `Rs ${amount.toLocaleString("en-PK")}`;
}

export function stockLabel(left: number) {
  if (left <= 0) return "Sold out";
  return `${left} in stock`;
}

export function stockTone(left: number) {
  if (left <= 0) return "is-out";
  if (left <= 5) return "is-low";
  return "";
}

export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function openBusinessDay<T extends { closedAt?: string | null }>(
  days: T[],
) {
  return days.find((day) => !day.closedAt) ?? null;
}

export function inDateRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function lineTotal(lines: { price: number; qty: number }[]) {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

export function itemsLabel(lines: { name: string; qty: number }[]) {
  return lines.map((line) => `${line.name} × ${line.qty}`).join(", ");
}

export function nowClock() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function line(id: string, qty: number) {
  const item = MENU_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown menu item ${id}`);
  return { id: item.id, name: item.name, price: item.price, qty };
}

const seedDate = todayISO();

export const SEED_ORDERS: PosOrder[] = [
  {
    id: "ord-47",
    token: 47,
    type: "takeaway",
    tableId: null,
    date: seedDate,
    time: "4:12 PM",
    status: "open",
    lines: [line("ck-half", 1), line("roti", 4)],
  },
  {
    id: "ord-46",
    token: 46,
    type: "dine-in",
    tableId: "T2",
    date: seedDate,
    time: "4:08 PM",
    status: "open",
    lines: [line("seekh", 2), line("naan", 3)],
  },
  {
    id: "ord-45",
    token: 45,
    type: "dine-in",
    tableId: "T5",
    date: seedDate,
    time: "4:01 PM",
    status: "open",
    lines: [line("biryani", 2)],
  },
  {
    id: "ord-44",
    token: 44,
    type: "dine-in",
    tableId: "T8",
    date: seedDate,
    time: "3:54 PM",
    status: "open",
    lines: [line("malai", 1), line("garlic", 2)],
  },
  {
    id: "ord-43",
    token: 43,
    type: "dine-in",
    tableId: "T4",
    date: seedDate,
    time: "3:40 PM",
    status: "billed",
    lines: [line("ck-full", 1), line("roti", 6)],
  },
  {
    id: "ord-42",
    token: 42,
    type: "dine-in",
    tableId: "T10",
    date: seedDate,
    time: "3:28 PM",
    status: "billed",
    lines: [line("mk-half", 1), line("naan", 2)],
  },
];

export const NEXT_TOKEN = 48;
