import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  diningFromLayout,
  lineTotal,
  loadLayout,
  LAYOUT_KEY,
  MENU_ITEMS,
  NEXT_TOKEN,
  nowClock,
  todayISO,
  DEFAULT_FLOOR,
} from "./demo-data";
import type {
  CartLine,
  DiningTable,
  ExpenseRow,
  MenuItem,
  PaymentMethod,
  PosOrder,
  StaffMember,
  TableLayout,
  TableStatus,
  DayOpen,
  PosSettings,
  TillSnapshot,
} from "./pos-types";
import { SETTINGS_KEY, isLogoDataUrl, loadSettings } from "./settings";
import { readTenantItem, writeTenantItem } from "./tenant-storage";
import { api } from "./api";

type PlaceInput = {
  type: PosOrder["type"];
  tableId: string | null;
  lines: CartLine[];
  status: "open" | "paid";
  payment?: PaymentMethod;
};

type PosContextValue = {
  restaurantId: string;
  ready: boolean;
  menu: MenuItem[];
  orders: PosOrder[];
  nextToken: number;
  tables: DiningTable[];
  layout: TableLayout[];
  saveLayout: (layout: TableLayout[]) => void;
  activeOrders: PosOrder[];
  available: (itemId: string, extra?: CartLine[]) => number;
  onTickets: (itemId: string) => number;
  addCooked: (itemId: string, qty: number) => void;
  placeOrder: (input: PlaceInput) => PosOrder;
  addItemToOrder: (orderId: string, item: MenuItem) => void;
  bumpOrderItem: (orderId: string, itemId: string, delta: number) => void;
  billOrder: (orderId: string) => void;
  payOrder: (orderId: string, payment: PaymentMethod) => void;
  saveMenuItem: (item: MenuItem) => void;
  refreshFloor: () => void;
  expenses: ExpenseRow[];
  staff: StaffMember[];
  addExpense: (row: Omit<ExpenseRow, "id">) => void;
  addStaff: (name: string, dailyWage: number) => void;
  recordWage: (staffId: string, date: string) => boolean;
  days: DayOpen[];
  todayOpen: DayOpen | null;
  startDay: (pettyCash: number, openedBy: string) => void;
  settings: PosSettings;
  updateSettings: (patch: Partial<PosSettings>) => void;
};

const ORDERS_KEY = "dmn_pos_orders";
const BOOKS_KEY = "dmn_pos_books";
const DAYS_KEY = "dmn_pos_days";
const MENU_KEY = "dmn_pos_menu";

function localTill(restaurantId: string): TillSnapshot {
  const saved = loadSavedOrders(restaurantId);
  const books = loadBooks(restaurantId);
  return {
    menu: loadMenu(restaurantId),
    orders: saved?.orders ?? [],
    nextToken: saved?.nextToken ?? 1,
    expenses: books.expenses,
    staff: books.staff,
    days: loadDays(restaurantId),
    settings: loadSettings(restaurantId),
    layout: loadLayout(restaurantId),
  };
}

function tillHasWork(till: TillSnapshot) {
  return (
    till.orders.length > 0 ||
    till.expenses.length > 0 ||
    till.days.length > 0 ||
    till.staff.length > 0 ||
    till.menu.some((item) => item.stock > 0)
  );
}

function cacheTill(restaurantId: string, till: TillSnapshot) {
  writeTenantItem(
    ORDERS_KEY,
    restaurantId,
    JSON.stringify({ orders: till.orders, nextToken: till.nextToken }),
  );
  writeTenantItem(
    BOOKS_KEY,
    restaurantId,
    JSON.stringify({ expenses: till.expenses, staff: till.staff }),
  );
  writeTenantItem(DAYS_KEY, restaurantId, JSON.stringify(till.days));
  writeTenantItem(MENU_KEY, restaurantId, JSON.stringify(till.menu));
  writeTenantItem(SETTINGS_KEY, restaurantId, JSON.stringify(till.settings));
  writeTenantItem(LAYOUT_KEY, restaurantId, JSON.stringify(till.layout));
}

const PosContext = createContext<PosContextValue | null>(null);

function asMenuItem(value: unknown): MenuItem | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as MenuItem;
  if (typeof entry.id !== "string" || !entry.id) return null;
  if (typeof entry.name !== "string" || !entry.name.trim()) return null;
  if (typeof entry.category !== "string") return null;
  if (!Number.isFinite(entry.price) || entry.price < 0) return null;
  const stock = Number(entry.stock);
  if (!Number.isFinite(stock) || stock < 0) return null;
  return {
    id: entry.id,
    name: entry.name.trim(),
    category: entry.category,
    price: entry.price,
    stock: Math.floor(stock),
    active: entry.active !== false,
    imageDataUrl: isLogoDataUrl(entry.imageDataUrl) ? entry.imageDataUrl : null,
  };
}

function loadMenu(restaurantId: string): MenuItem[] {
  const catalog = MENU_ITEMS.map((item) => ({ ...item, stock: 0 }));
  try {
    const raw = readTenantItem(MENU_KEY, restaurantId);
    if (!raw) return catalog;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return catalog;
    const saved = parsed
      .map(asMenuItem)
      .filter((item): item is MenuItem => item !== null);
    const byId = new Map(saved.map((item) => [item.id, item]));
    const merged = catalog.map((item) => {
      const prev = byId.get(item.id);
      byId.delete(item.id);
      return prev
        ? {
            ...item,
            name: prev.name,
            category: prev.category || item.category,
            price: prev.price,
            stock: prev.stock,
            active: prev.active,
            imageDataUrl: prev.imageDataUrl ?? null,
          }
        : item;
    });
    return [...merged, ...byId.values()];
  } catch {
    return catalog;
  }
}

function normalizePayment(value: string | undefined): PaymentMethod | undefined {
  if (value === "online" || value === "card") return "online";
  if (value === "cash") return "cash";
  return undefined;
}

function loadSavedOrders(
  restaurantId: string,
): { orders: PosOrder[]; nextToken: number } | null {
  try {
    const raw = readTenantItem(ORDERS_KEY, restaurantId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orders?: PosOrder[]; nextToken?: number };
    if (!Array.isArray(parsed.orders)) return null;
    const fallbackDate = todayISO();
    return {
      orders: parsed.orders.map((order) => ({
        ...order,
        date: order.date || fallbackDate,
        payment: normalizePayment(order.payment),
      })),
      nextToken:
        typeof parsed.nextToken === "number" ? parsed.nextToken : NEXT_TOKEN,
    };
  } catch {
    return null;
  }
}

function loadBooks(
  restaurantId: string,
): { expenses: ExpenseRow[]; staff: StaffMember[] } {
  try {
    const raw = readTenantItem(BOOKS_KEY, restaurantId);
    if (!raw) return { expenses: [], staff: [] };
    const parsed = JSON.parse(raw) as {
      expenses?: ExpenseRow[];
      staff?: StaffMember[];
    };
    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    };
  } catch {
    return { expenses: [], staff: [] };
  }
}

function loadDays(restaurantId: string): DayOpen[] {
  try {
    const raw = readTenantItem(DAYS_KEY, restaurantId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DayOpen[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function reservedQty(
  itemId: string,
  orders: PosOrder[],
  extra: CartLine[] = [],
) {
  const fromOrders = orders
    .filter((order) => order.status !== "paid")
    .flatMap((order) => order.lines)
    .filter((line) => line.id === itemId)
    .reduce((sum, line) => sum + line.qty, 0);
  const fromExtra = extra
    .filter((line) => line.id === itemId)
    .reduce((sum, line) => sum + line.qty, 0);
  return fromOrders + fromExtra;
}

function consumeStock(menu: MenuItem[], lines: CartLine[]) {
  return menu.map((item) => {
    const used = lines
      .filter((line) => line.id === item.id)
      .reduce((sum, line) => sum + line.qty, 0);
    return used ? { ...item, stock: Math.max(0, item.stock - used) } : item;
  });
}

export function PosProvider({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState<MenuItem[]>(() => loadMenu(restaurantId));
  const [orders, setOrders] = useState<PosOrder[]>(
    () => loadSavedOrders(restaurantId)?.orders ?? [],
  );
  const [nextToken, setNextToken] = useState(
    () => loadSavedOrders(restaurantId)?.nextToken ?? 1,
  );
  const [layout, setLayout] = useState<TableLayout[]>(() => {
    const saved = loadLayout(restaurantId);
    return saved.length > 0 ? saved : DEFAULT_FLOOR;
  });
  const [expenses, setExpenses] = useState<ExpenseRow[]>(
    () => loadBooks(restaurantId).expenses,
  );
  const [staff, setStaff] = useState<StaffMember[]>(
    () => loadBooks(restaurantId).staff,
  );
  const [days, setDays] = useState<DayOpen[]>(() => loadDays(restaurantId));
  const [settings, setSettings] = useState<PosSettings>(() =>
    loadSettings(restaurantId),
  );
  const pendingTill = useRef<TillSnapshot | null>(null);

  function applyTill(till: TillSnapshot) {
    setMenu(till.menu);
    setOrders(till.orders);
    setNextToken(till.nextToken);
    setLayout(till.layout.length > 0 ? till.layout : DEFAULT_FLOOR);
    setExpenses(till.expenses);
    setStaff(till.staff);
    setDays(till.days);
    setSettings(till.settings);
    cacheTill(restaurantId, till);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const remote = await api<TillSnapshot>("/till");
        const local = localTill(restaurantId);
        const migrate = !tillHasWork(remote) && tillHasWork(local);
        const till = migrate ? local : remote;
        if (migrate) {
          await api("/till", {
            method: "PUT",
            body: JSON.stringify(local),
          });
        }
        if (!cancelled) applyTill(till);
      } catch {
        if (!cancelled) applyTill(localTill(restaurantId));
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!ready) return;
    const till: TillSnapshot = {
      menu,
      orders,
      nextToken,
      expenses,
      staff,
      days,
      settings,
      layout,
    };
    cacheTill(restaurantId, till);
    pendingTill.current = till;
    const timer = window.setTimeout(() => {
      const payload = pendingTill.current;
      pendingTill.current = null;
      if (!payload) return;
      void api("/till", {
        method: "PUT",
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    restaurantId,
    menu,
    orders,
    nextToken,
    expenses,
    staff,
    days,
    settings,
    layout,
  ]);

  useEffect(() => {
    return () => {
      const payload = pendingTill.current;
      if (!payload) return;
      void api("/till", {
        method: "PUT",
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    document.title = settings.restaurantName;
  }, [settings.restaurantName]);

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "paid"),
    [orders],
  );

  const tables = useMemo<DiningTable[]>(() => {
    return diningFromLayout(layout).map((table) => {
      const order = activeOrders.find((entry) => entry.tableId === table.id);
      if (!order) {
        return { id: table.id, label: table.label, status: "free" as TableStatus };
      }
      return {
        id: table.id,
        label: table.label,
        status: (order.status === "billed" ? "bill" : "seated") as TableStatus,
        itemCount: order.lines.reduce((sum, line) => sum + line.qty, 0),
      };
    });
  }, [activeOrders, layout]);

  function refreshFloor() {
    setLayout((current) => [...current]);
  }

  function saveLayout(next: TableLayout[]) {
    setLayout(next);
  }

  function available(itemId: string, extra: CartLine[] = []) {
    if (!settings.useInventory) return 10_000;
    const item = menu.find((entry) => entry.id === itemId);
    if (!item) return 0;
    return Math.max(0, item.stock - reservedQty(itemId, orders, extra));
  }

  function onTickets(itemId: string) {
    return reservedQty(itemId, orders);
  }

  function addCooked(itemId: string, qty: number) {
    const n = Math.floor(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    setMenu((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, stock: item.stock + n } : item,
      ),
    );
  }

  function placeOrder(input: PlaceInput) {
    const order: PosOrder = {
      id: `ord-${Date.now()}`,
      token: nextToken,
      type: input.type,
      tableId: input.tableId,
      lines: input.lines,
      status: input.status,
      date: todayISO(),
      time: nowClock(),
      payment: input.payment,
    };
    setNextToken((value) => value + 1);
    setOrders((current) => [order, ...current]);
    if (input.status === "paid" && settings.useInventory) {
      setMenu((current) => consumeStock(current, input.lines));
    }
    return order;
  }

  function addItemToOrder(orderId: string, item: MenuItem) {
    if (available(item.id) <= 0) return;
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId || order.status === "paid") return order;
        const existing = order.lines.find((line) => line.id === item.id);
        const lines = existing
          ? order.lines.map((line) =>
              line.id === item.id ? { ...line, qty: line.qty + 1 } : line,
            )
          : [...order.lines, { id: item.id, name: item.name, price: item.price, qty: 1 }];
        return { ...order, lines };
      }),
    );
  }

  function bumpOrderItem(orderId: string, itemId: string, delta: number) {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId || order.status === "paid") return order;
        if (delta > 0 && available(itemId) <= 0) return order;
        const lines = order.lines
          .map((line) =>
            line.id === itemId ? { ...line, qty: line.qty + delta } : line,
          )
          .filter((line) => line.qty > 0);
        return { ...order, lines };
      }),
    );
  }

  function billOrder(orderId: string) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && order.lines.length > 0
          ? { ...order, status: "billed" }
          : order,
      ),
    );
  }

  function payOrder(orderId: string, payment: PaymentMethod) {
    const target = orders.find((order) => order.id === orderId);
    if (!target || target.status === "paid" || target.lines.length === 0) return;
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: "paid", payment } : order,
      ),
    );
    if (settings.useInventory) {
      setMenu((current) => consumeStock(current, target.lines));
    }
  }

  function addExpense(row: Omit<ExpenseRow, "id">) {
    setExpenses((current) => [
      { ...row, id: `exp-${Date.now()}` },
      ...current,
    ]);
  }

  function addStaff(name: string, dailyWage: number) {
    const trimmed = name.trim();
    if (!trimmed || !Number.isFinite(dailyWage) || dailyWage <= 0) return;
    setStaff((current) => [
      ...current,
      { id: `staff-${Date.now()}`, name: trimmed, dailyWage },
    ]);
  }

  function recordWage(staffId: string, date: string) {
    const member = staff.find((entry) => entry.id === staffId);
    if (!member) return false;
    let added = false;
    setExpenses((current) => {
      if (current.some((row) => row.staffId === staffId && row.date === date)) {
        return current;
      }
      added = true;
      return [
        {
          id: `exp-${Date.now()}`,
          title: `${member.name} daily wage`,
          category: "Labor",
          amount: member.dailyWage,
          date,
          notes: "Daily wage",
          staffId,
        },
        ...current,
      ];
    });
    return added;
  }

  function saveMenuItem(item: MenuItem) {
    setMenu((current) => {
      const exists = current.some((entry) => entry.id === item.id);
      if (exists) {
        return current.map((entry) => (entry.id === item.id ? item : entry));
      }
      return [...current, item];
    });
  }

  const todayOpen = days.find((day) => day.date === todayISO()) ?? null;

  function startDay(pettyCash: number, openedBy: string) {
    if (!Number.isFinite(pettyCash) || pettyCash < 0) return;
    const date = todayISO();
    const now = new Date();
    let opened = false;
    setDays((current) => {
      if (current.some((day) => day.date === date)) return current;
      opened = true;
      return [
        {
          date,
          openedAt: now.toISOString(),
          pettyCash,
          openedBy,
        },
        ...current,
      ];
    });
    if (opened) sessionStorage.setItem("shift_started", now.toISOString());
  }

  function updateSettings(patch: Partial<PosSettings>) {
    setSettings((current) => {
      const restaurantName =
        typeof patch.restaurantName === "string"
          ? patch.restaurantName.trim()
          : current.restaurantName;
      return {
        ...current,
        ...patch,
        restaurantName: restaurantName || current.restaurantName,
      };
    });
  }

  const value: PosContextValue = {
    restaurantId,
    ready,
    menu,
    orders,
    nextToken,
    tables,
    layout,
    saveLayout,
    activeOrders,
    available,
    onTickets,
    addCooked,
    placeOrder,
    addItemToOrder,
    bumpOrderItem,
    billOrder,
    payOrder,
    saveMenuItem,
    refreshFloor,
    expenses,
    staff,
    addExpense,
    addStaff,
    recordWage,
    days,
    todayOpen,
    startDay,
    settings,
    updateSettings,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function useOptionalPos() {
  return useContext(PosContext);
}

export function usePos() {
  const value = useContext(PosContext);
  if (!value) throw new Error("usePos must be used inside PosProvider");
  return value;
}

export { lineTotal };
