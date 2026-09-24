import { BadRequestException } from '@nestjs/common';
import { DEFAULT_FLOOR } from './default-catalog';
import { mergeMenuCategories } from './menu-categories';

export type TillMenuItem = {
  id: string;
  name: string;
  nameUrdu: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
  imageDataUrl: string | null;
};

export type TillLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type TillOrder = {
  id: string;
  token: number;
  type: 'takeaway' | 'dine-in';
  tableId: string | null;
  lines: TillLine[];
  status: 'open' | 'billed' | 'paid';
  date: string;
  time: string;
  payment?: 'cash' | 'online';
};

export type TillExpense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  notes: string;
  staffId?: string;
};

export type TillStaff = {
  id: string;
  name: string;
  dailyWage: number;
};

export type TillDay = {
  date: string;
  openedAt: string;
  pettyCash: number;
  openedBy: string;
  closedAt: string | null;
};

export type TillSettings = {
  restaurantName: string;
  logoDataUrl: string | null;
  requirePettyCash: boolean;
  useInventory: boolean;
  useTables: boolean;
};

export type TillLayout = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'round' | 'rect';
  kind?: 'table' | 'counter';
};

export type TillSnapshot = {
  menu: TillMenuItem[];
  orders: TillOrder[];
  nextToken: number;
  expenses: TillExpense[];
  staff: TillStaff[];
  days: TillDay[];
  settings: TillSettings;
  layout: TillLayout[];
  categories: string[];
};

const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function moneyStr(value: number) {
  return value.toFixed(2);
}

export function asDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function isLogoDataUrl(value: unknown): value is string {
  return typeof value === 'string' && LOGO_PATTERN.test(value);
}

export function readLayout(value: unknown): TillLayout[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_FLOOR;
  const pieces = value
    .map((entry) => asLayout(entry))
    .filter((piece): piece is TillLayout => piece !== null);
  return pieces.length > 0 ? pieces : DEFAULT_FLOOR;
}

export function asLayout(value: unknown): TillLayout | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as TillLayout;
  if (typeof entry.id !== 'string' || !entry.id) return null;
  const x = Number(entry.x);
  const y = Number(entry.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: entry.id,
    x,
    y,
    w: Number(entry.w) || 128,
    h: Number(entry.h) || 128,
    shape: entry.shape === 'rect' ? 'rect' : 'round',
    kind: entry.kind === 'counter' ? 'counter' : 'table',
  };
}

export type TillWriteBody = {
  menu?: Array<Partial<TillMenuItem> | null | undefined>;
  orders?: Array<Partial<TillOrder> | null | undefined>;
  nextToken?: unknown;
  expenses?: Array<Partial<TillExpense> | null | undefined>;
  staff?: Array<Partial<TillStaff> | null | undefined>;
  days?: Array<Partial<TillDay> | null | undefined>;
  settings?: Partial<TillSettings> | null;
  layout?: unknown;
  categories?: unknown;
};

export function normalizeTillSnapshot(body: TillWriteBody): TillSnapshot {
  if (!Array.isArray(body.menu)) {
    throw new BadRequestException('Menu is required.');
  }
  const restaurantName =
    typeof body.settings?.restaurantName === 'string' &&
    body.settings.restaurantName.trim()
      ? body.settings.restaurantName.trim()
      : 'Restaurant';
  const logo = body.settings?.logoDataUrl ?? null;
  const menu = body.menu.map((item, index) => {
    const image = item?.imageDataUrl ?? null;
    return {
      id: String(item?.id || `item-${index}`),
      name: String(item?.name || 'Item').trim() || 'Item',
      nameUrdu:
        typeof item?.nameUrdu === 'string' ? item.nameUrdu.trim() : '',
      category: String(item?.category || 'Other'),
      price: Math.max(0, money(item?.price)),
      stock: Math.max(0, Math.floor(money(item?.stock))),
      active: item?.active !== false,
      imageDataUrl: isLogoDataUrl(image) ? image : null,
    };
  });
  return {
    menu,
    orders: Array.isArray(body.orders)
      ? body.orders.map((order, index) =>
          normalizeOrder(order as TillOrder, index),
        )
      : [],
    nextToken: Math.max(1, Math.floor(money(body.nextToken) || 1)),
    expenses: Array.isArray(body.expenses)
      ? body.expenses.map((row, index) => ({
          id: String(row?.id || `exp-${index}`),
          title: String(row?.title || 'Expense').trim() || 'Expense',
          category: String(row?.category || 'Other'),
          amount: Math.max(0, money(row?.amount)),
          date: String(row?.date || '').slice(0, 10),
          notes: String(row?.notes || ''),
          staffId: row?.staffId ? String(row.staffId) : undefined,
        }))
      : [],
    staff: Array.isArray(body.staff)
      ? body.staff.map((row, index) => ({
          id: String(row?.id || `staff-${index}`),
          name: String(row?.name || 'Staff').trim() || 'Staff',
          dailyWage: Math.max(0, money(row?.dailyWage)),
        }))
      : [],
    days: Array.isArray(body.days)
      ? body.days.map((row) => ({
          date: String(row?.date || '').slice(0, 10),
          openedAt: String(row?.openedAt || new Date().toISOString()),
          pettyCash: Math.max(0, money(row?.pettyCash)),
          openedBy: String(row?.openedBy || 'Staff'),
          closedAt: row?.closedAt ? String(row.closedAt) : null,
        }))
      : [],
    settings: {
      restaurantName,
      logoDataUrl: isLogoDataUrl(logo) ? logo : null,
      requirePettyCash: body.settings?.requirePettyCash !== false,
      useInventory: body.settings?.useInventory !== false,
      useTables: body.settings?.useTables !== false,
    },
    layout: readLayout(body.layout),
    categories: mergeMenuCategories(
      body.categories,
      menu.map((item) => item.category),
    ),
  };
}

export function normalizeOrder(order: TillOrder, index: number): TillOrder {
  const payment =
    order?.payment === 'online' || order?.payment === 'cash'
      ? order.payment
      : undefined;
  const status =
    order?.status === 'billed' || order?.status === 'paid' ? order.status : 'open';
  return {
    id: String(order?.id || `ord-${index}`),
    token: Math.max(1, Math.floor(money(order?.token) || index + 1)),
    type: order?.type === 'dine-in' ? 'dine-in' : 'takeaway',
    tableId: order?.tableId ? String(order.tableId) : null,
    date: String(order?.date || '').slice(0, 10),
    time: String(order?.time || ''),
    status,
    payment,
    lines: Array.isArray(order?.lines)
      ? order.lines.map((line) => ({
          id: String(line?.id || ''),
          name: String(line?.name || 'Item'),
          price: Math.max(0, money(line?.price)),
          qty: Math.max(1, Math.floor(money(line?.qty) || 1)),
        }))
      : [],
  };
}
