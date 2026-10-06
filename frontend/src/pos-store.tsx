import {
  createContext,
  useCallback,
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
  openBusinessDay,
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
import { placeMenuItem } from "./menu-board";
import { mergeInventoryCsv } from "./inventory-csv";
import {
  addMenuCategory,
  mergeMenuCategories,
  remapItemCategory,
  removeMenuCategory,
  renameMenuCategory,
} from "./menu-categories";
import {
  clearTillDirty,
  createTillPusher,
  isBrowserOnline,
  markTillDirty,
  tillIsDirty,
  readTillOutbox,
  writeTillOutbox,
  type TillSyncState,
} from "./till-sync";
import {
  applyMenuPhotos,
  loadMenuPhotos,
  menuWithoutPhotos,
  saveMenuPhotos,
} from "./menu-photos";
import {
  CATALOG_OFFLINE_ERROR,
} from "./till-merge";

import { applyOutbox, diffTill, type TillPatch } from "./till-patch";

import { migrateLegacyTill } from "./till-legacy-migration";
import { currentBusinessDay, nextTokenForDay } from "./business-day";

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
  sync: TillSyncState;
  menu: MenuItem[];
  categories: string[];
  addCategory: (name: string) => string | null;
  renameCategory: (from: string, to: string) => string | null;
  deleteCategory: (name: string, moveTo?: string) => string | null;
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
  setOrderItemQty: (orderId: string, itemId: string, qty: number) => void;
  billOrder: (orderId: string) => void;
  payOrder: (orderId: string, payment: PaymentMethod) => void;
  deleteOrder: (orderId: string) => void;
  saveMenuItem: (item: MenuItem) => void;
  importMenuFromCsv: (text: string, photos?: Record<string, string>) => { error?: string; added: number; updated: number };
  deleteMenuItem: (id: string) => void;
  moveMenuItem: (fromId: string, toId: string) => void;
  refreshFloor: () => void;
  expenses: ExpenseRow[];
  staff: StaffMember[];
  addExpense: (row: Omit<ExpenseRow, "id">) => void;
  updateExpense: (id: string, patch: Omit<ExpenseRow, "id" | "staffId">) => void;
  deleteExpense: (id: string) => void;
  addStaff: (name: string, dailyWage: number) => void;
  updateStaff: (staffId: string, patch: { name?: string; dailyWage?: number }) => void;
  deleteStaff: (staffId: string) => void;
  recordWage: (staffId: string, date: string) => boolean;
  days: DayOpen[];
  todayOpen: DayOpen | null;
  startDay: (pettyCash: number, openedBy: string) => void;
  endDay: () => string | null;
  settings: PosSettings;
  updateSettings: (patch: Partial<PosSettings>) => void;
  canAmendCatalog: boolean;
  resolveSyncConflict: (keep: "local" | "server") => void;
};

const ORDERS_KEY = "dmn_pos_orders";
const BOOKS_KEY = "dmn_pos_books";
const DAYS_KEY = "dmn_pos_days";
const MENU_KEY = "dmn_pos_menu";
const CATEGORIES_KEY = "dmn_pos_categories";

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
    categories: loadCategories(restaurantId, loadMenu(restaurantId)),
  };
}

function cacheTill(restaurantId: string, till: TillSnapshot) {
  void saveMenuPhotos(restaurantId, till.menu);
  const writes: Array<[string, string]> = [
    [ORDERS_KEY, JSON.stringify({ orders: till.orders, nextToken: till.nextToken, nextTokenDay: currentBusinessDay() })],
    [BOOKS_KEY, JSON.stringify({ expenses: till.expenses, staff: till.staff })],
    [DAYS_KEY, JSON.stringify(till.days)],
    [MENU_KEY, JSON.stringify(menuWithoutPhotos(till.menu))],
    [SETTINGS_KEY, JSON.stringify(till.settings)],
    [LAYOUT_KEY, JSON.stringify(till.layout)],
    [CATEGORIES_KEY, JSON.stringify(till.categories)],
  ];
  try {
    for (const [key, value] of writes) writeTenantItem(key, restaurantId, value);
  } catch {
    // device storage is full — photos live in IndexedDB / server
  }
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
    nameUrdu: typeof entry.nameUrdu === "string" ? entry.nameUrdu.trim() : "",
    category: entry.category,
    price: entry.price,
    stock: Math.floor(stock),
    active: entry.active !== false,
    imageDataUrl: isLogoDataUrl(entry.imageDataUrl) ? entry.imageDataUrl : null,
  };
}

function loadCategories(restaurantId: string, menu: MenuItem[]): string[] {
  try {
    const raw = readTenantItem(CATEGORIES_KEY, restaurantId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : undefined;
    return mergeMenuCategories(
      parsed,
      menu.map((item) => item.category),
    );
  } catch {
    return mergeMenuCategories(
      undefined,
      menu.map((item) => item.category),
    );
  }
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
    return saved.length > 0 ? saved : catalog;
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
): { orders: PosOrder[]; nextToken: number; nextTokenDay?: string } | null {
  try {
    const raw = readTenantItem(ORDERS_KEY, restaurantId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orders?: PosOrder[]; nextToken?: number; nextTokenDay?: string };
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
      nextTokenDay: parsed.nextTokenDay,
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

function restoreStock(menu: MenuItem[], lines: CartLine[]) {
  return menu.map((item) => {
    const used = lines
      .filter((line) => line.id === item.id)
      .reduce((sum, line) => sum + line.qty, 0);
    return used ? { ...item, stock: item.stock + used } : item;
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
  const tokenDayRef = useRef(currentBusinessDay());
  const [storedNextToken, setNextToken] = useState(() => {
    const saved = loadSavedOrders(restaurantId);
    return Math.max(nextTokenForDay(saved?.orders ?? []),
      saved?.nextTokenDay === currentBusinessDay() ? saved.nextToken : 1);
  });
  const [businessDay, setBusinessDay] = useState(currentBusinessDay);
  useEffect(() => {
    const timer = window.setInterval(() => setBusinessDay(currentBusinessDay()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const nextToken = Math.max(nextTokenForDay(orders, businessDay),
    tokenDayRef.current === businessDay ? storedNextToken : 1);
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
  const [categories, setCategories] = useState<string[]>(() =>
    loadCategories(restaurantId, loadMenu(restaurantId)),
  );
  const [sync, setSync] = useState<TillSyncState>({
    status: "saving",
    error: null,
  });
  const [catalogOnline, setCatalogOnline] = useState(isBrowserOnline);
  const syncBlockedRef = useRef(false);
  const lastPushedJson = useRef<string | null>(null);
  const restaurantIdRef = useRef(restaurantId);
  restaurantIdRef.current = restaurantId;
  const onSavedRef = useRef<(till: TillSnapshot) => void>(() => undefined);
  const onStatusRef = useRef<(state: TillSyncState) => void>(() => undefined);
  onSavedRef.current = (till: TillSnapshot) => {
    lastPushedJson.current = JSON.stringify(till);
    clearTillDirty(restaurantIdRef.current);
  };
  onStatusRef.current = setSync;
  useEffect(() => {
    function syncOnline() {
      setCatalogOnline(isBrowserOnline());
    }
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);
  const pusherRef = useRef(
    createTillPusher({
      put: (body) =>
        api("/till/sync", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      persist: (patch) => writeTillOutbox(restaurantIdRef.current, patch),
      onSaved: (till) => onSavedRef.current(till),
      onStatus: (state) => onStatusRef.current(state),
    }),
  );

  useEffect(() => {
    const pusher = pusherRef.current;
    pusher.start();
    return () => pusher.stop();
  }, []);

  function normalizedTill(till: TillSnapshot): TillSnapshot {
    return {
      ...till,
      layout: till.layout.length > 0 ? till.layout : DEFAULT_FLOOR,
      categories: mergeMenuCategories(
        till.categories,
        till.menu.map((item) => item.category),
      ),
    };
  }

  function applyTill(till: TillSnapshot, synced: boolean) {
    const next = normalizedTill(till);
    setMenu(next.menu);
    setOrders(next.orders);
    const saved = loadSavedOrders(restaurantId);
    const day = currentBusinessDay();
    tokenDayRef.current = day;
    next.nextToken = Math.max(nextTokenForDay(next.orders, day), saved?.nextTokenDay === day ? saved.nextToken : 1);
    setNextToken(next.nextToken);
    setLayout(next.layout);
    setExpenses(next.expenses);
    setStaff(next.staff);
    setDays(next.days);
    setSettings(next.settings);
    setCategories(next.categories);
    cacheTill(restaurantId, next);
    if (synced) {
      lastPushedJson.current = JSON.stringify(next);
      clearTillDirty(restaurantId);
      setSync({ status: "saved", error: null });
    } else {
      lastPushedJson.current = null;
    }
  }

  function requireCatalog() {
    if (isBrowserOnline()) return true;
    setCatalogOnline(false);
    setSync({ status: "error", error: CATALOG_OFFLINE_ERROR });
    return false;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const photos = await loadMenuPhotos(restaurantId);
      let local: TillSnapshot = {
        ...localTill(restaurantId),
      };
      local = {
        ...local,
        menu: applyMenuPhotos(local.menu, photos),
      };
      const dirty = tillIsDirty(restaurantId);
      try {
        const remote = await api<TillSnapshot>("/till");
        if (cancelled) return;
        local = {
          ...local,
          menu: applyMenuPhotos(local.menu, photos, remote.menu),
        };
        const pending = readTillOutbox(restaurantId);
        let recovered: TillSnapshot;
        if (pending?.changes.length || pending?.submitted) {
          // Retain the original before values: fetching remote must not bless a stale edit.
          pusherRef.current.initialize(remote, pending);
          recovered = applyOutbox(remote, pending);
        } else if (dirty) {
          recovered = migrateLegacyTill(local, remote);
          pusherRef.current.initialize(remote);
        } else {
          pusherRef.current.initialize(remote);
          recovered = remote;
        }
        if (!cancelled) {
          const hasChanges = diffTill(remote, recovered).changes.length > 0 || Boolean(pending?.changes.length || pending?.submitted);
          applyTill(recovered, !hasChanges);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error && error.message.trim() ? error.message : "Could not reach the server";
        // Only transport failures allow offline startup; migration/storage errors stop sync.
        const needsReview = message.includes("needs review") || message.includes("offline queue");
        syncBlockedRef.current = needsReview;
        applyTill(local, false);
        if (!needsReview) {
          let pending: TillPatch | null = null;
          try { pending = readTillOutbox(restaurantId); }
          catch { syncBlockedRef.current = true; }
          if (!syncBlockedRef.current) {
            pusherRef.current.initialize(local, pending);
            if (dirty && !pending) {
              syncBlockedRef.current = true;
              setSync({ status: "error", error: "Connect and reload to migrate unsynced work from the previous app version. Local records have been retained." });
              return;
            }
            const recovered = pending ? applyOutbox(local, pending) : local;
            applyTill(recovered, false);
            if (pending?.changes.length || pending?.submitted) pusherRef.current.enqueue(recovered);
          }
        }
        setSync({ status: isBrowserOnline() || needsReview ? "error" : "queued", error: isBrowserOnline() || needsReview ? message : null });
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
      categories,
    };
    cacheTill(restaurantId, till);
    // A migration conflict stops network writes, not local persistence.
    if (syncBlockedRef.current) return;
    const json = JSON.stringify(till);
    if (json === lastPushedJson.current) return;
    markTillDirty(restaurantId);
    pusherRef.current.enqueue(till);
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
    categories,
  ]);

  function resolveSyncConflict(keep: "local" | "server") {
    const till = pusherRef.current.resolveConflict(keep);
    if (keep === "server" && till) applyTill(till, false);
  }

  useEffect(() => {
    const pusher = pusherRef.current;
    function flush() {
      void pusher.flushNow();
    }
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      void pusher.flushNow();
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
    if (!requireCatalog()) return;
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
    if (!requireCatalog()) return;
    setMenu((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, stock: item.stock + n } : item,
      ),
    );
  }

  function placeOrder(input: PlaceInput) {
    const day = currentBusinessDay();
    const token = Math.max(nextTokenForDay(orders, day), tokenDayRef.current === day ? storedNextToken : 1);
    const order: PosOrder = {
      id: `ord-${Date.now()}-${crypto.randomUUID()}`,
      token,
      type: input.type,
      tableId: input.tableId,
      lines: input.lines,
      status: input.status,
      date: todayISO(),
      time: nowClock(),
      payment: input.payment,
      paidAt: input.status === "paid" ? new Date().toISOString() : undefined,
    };
    tokenDayRef.current = day;
    setBusinessDay(day);
    setNextToken(token + 1);
    setOrders((current) => [order, ...current]);
    if (input.status === "paid" && settings.useInventory) {
      setMenu((current) => consumeStock(current, input.lines));
    }
    return order;
  }

  function addItemToOrder(orderId: string, item: MenuItem) {
    const target = orders.find((order) => order.id === orderId);
    if (!target) return;
    if (available(item.id) <= 0) return;
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) return order;
        const existing = order.lines.find((line) => line.id === item.id);
        const lines = existing
          ? order.lines.map((line) =>
              line.id === item.id ? { ...line, qty: line.qty + 1 } : line,
            )
          : [...order.lines, { id: item.id, name: item.name, price: item.price, qty: 1 }];
        return { ...order, lines };
      }),
    );
    if (target.status === "paid" && settings.useInventory) {
      setMenu((current) => consumeStock(current, [{ id: item.id, name: item.name, price: item.price, qty: 1 }]));
    }
  }

  function bumpOrderItem(orderId: string, itemId: string, delta: number) {
    const order = orders.find((entry) => entry.id === orderId);
    const line = order?.lines.find((entry) => entry.id === itemId);
    if (!line) return;
    setOrderItemQty(orderId, itemId, line.qty + delta);
  }

  function setOrderItemQty(orderId: string, itemId: string, qty: number) {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const line = order.lines.find((entry) => entry.id === itemId);
    if (!line) return;
    const n = Math.floor(qty);
    const max = line.qty + available(itemId);
    const nextQty = !Number.isFinite(n) || n <= 0 ? 0 : Math.min(n, max);
    setOrders((current) =>
      current.map((entry) => {
        if (entry.id !== orderId) return entry;
        const lines =
          nextQty <= 0
            ? entry.lines.filter((row) => row.id !== itemId)
            : entry.lines.map((row) =>
                row.id === itemId ? { ...row, qty: nextQty } : row,
              );
        return { ...entry, lines };
      }),
    );
    if (order.status === "paid" && settings.useInventory) {
      const delta = nextQty - line.qty;
      if (delta > 0) setMenu((current) => consumeStock(current, [{ ...line, qty: delta }]));
      if (delta < 0) setMenu((current) => restoreStock(current, [{ ...line, qty: -delta }]));
    }
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
        order.id === orderId ? { ...order, status: "paid", payment, paidAt: new Date().toISOString() } : order,
      ),
    );
    if (settings.useInventory) {
      setMenu((current) => consumeStock(current, target.lines));
    }
  }

  function deleteOrder(orderId: string) {
    const target = orders.find((order) => order.id === orderId);
    if (!target) return;
    setOrders((current) => current.filter((order) => order.id !== orderId));
    if (target.status === "paid" && settings.useInventory) {
      setMenu((current) => restoreStock(current, target.lines));
    }
  }

  function addExpense(row: Omit<ExpenseRow, "id">) {
    setExpenses((current) => [
      { ...row, id: `exp-${Date.now()}-${crypto.randomUUID()}` },
      ...current,
    ]);
  }

  function updateExpense(
    id: string,
    patch: Omit<ExpenseRow, "id" | "staffId">,
  ) {
    setExpenses((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              title: patch.title,
              category: patch.category,
              amount: patch.amount,
              date: patch.date,
              notes: patch.notes,
            }
          : row,
      ),
    );
  }

  function deleteExpense(id: string) {
    setExpenses((current) => current.filter((row) => row.id !== id));
  }

  function addStaff(name: string, dailyWage: number) {
    if (!requireCatalog()) return;
    const trimmed = name.trim();
    if (!trimmed || !Number.isFinite(dailyWage) || dailyWage <= 0) return;
    setStaff((current) => [
      ...current,
      { id: `staff-${Date.now()}`, name: trimmed, dailyWage },
    ]);
  }

  function updateStaff(
    staffId: string,
    patch: { name?: string; dailyWage?: number },
  ) {
    if (!requireCatalog()) return;
    setStaff((current) =>
      current.map((member) => {
        if (member.id !== staffId) return member;
        const name =
          typeof patch.name === "string" ? patch.name.trim() : member.name;
        const dailyWage =
          typeof patch.dailyWage === "number" &&
          Number.isFinite(patch.dailyWage) &&
          patch.dailyWage > 0
            ? patch.dailyWage
            : member.dailyWage;
        if (!name) return member;
        return { ...member, name, dailyWage };
      }),
    );
  }

  function deleteStaff(staffId: string) {
    if (!requireCatalog()) return;
    setStaff((current) => current.filter((member) => member.id !== staffId));
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
          id: `exp-${Date.now()}-${crypto.randomUUID()}`,
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
    if (!requireCatalog()) return;
    setMenu((current) => {
      const exists = current.some((entry) => entry.id === item.id);
      if (exists) {
        return current.map((entry) => (entry.id === item.id ? item : entry));
      }
      return [...current, item];
    });
    setCategories((current) => {
      const added = addMenuCategory(current, item.category);
      return added.ok ? added.list : current;
    });
  }

  function importMenuFromCsv(text: string, photos?: Record<string, string>) {
    if (!requireCatalog()) {
      return { error: CATALOG_OFFLINE_ERROR, added: 0, updated: 0 };
    }
    const result = mergeInventoryCsv(menu, text, photos);
    if (result.error) return { error: result.error, added: 0, updated: 0 };
    setMenu(result.menu);
    setCategories((current) =>
      mergeMenuCategories(
        current,
        result.menu.map((entry) => entry.category),
      ),
    );
    return { added: result.added, updated: result.updated };
  }

  function deleteMenuItem(id: string) {
    if (!id) return;
    if (!requireCatalog()) return;
    setMenu((current) => current.filter((entry) => entry.id !== id));
  }

  function moveMenuItem(fromId: string, toId: string) {
    if (!requireCatalog()) return;
    setMenu((current) => placeMenuItem(current, fromId, toId));
  }

  function addCategory(name: string) {
    if (!requireCatalog()) return CATALOG_OFFLINE_ERROR;
    const next = addMenuCategory(categories, name);
    if (!next.ok) return next.error;
    setCategories(next.list);
    return null;
  }

  function renameCategory(from: string, to: string) {
    if (!requireCatalog()) return CATALOG_OFFLINE_ERROR;
    const next = renameMenuCategory(categories, from, to);
    if (!next.ok) return next.error;
    const previous = next.from ?? from;
    const renamed = next.to ?? to;
    setCategories(next.list);
    setMenu((current) =>
      current.map((item) => ({
        ...item,
        category: remapItemCategory(item.category, previous, renamed),
      })),
    );
    return null;
  }

  function deleteCategory(name: string, moveTo?: string) {
    if (!requireCatalog()) return CATALOG_OFFLINE_ERROR;
    const next = removeMenuCategory(categories, name);
    if (!next.ok) return next.error;
    const fallback =
      moveTo && next.list.includes(moveTo) ? moveTo : next.list[0];
    setCategories(next.list);
    setMenu((current) =>
      current.map((item) => ({
        ...item,
        category: remapItemCategory(item.category, name, fallback),
      })),
    );
    return null;
  }

  const todayOpen = openBusinessDay(days);

  const startDay = useCallback((pettyCash: number, openedBy: string) => {
    if (!Number.isFinite(pettyCash) || pettyCash < 0) return;
    const date = todayISO();
    const now = new Date();
    let opened = false;
    setDays((current) => {
      if (openBusinessDay(current)) return current;
      opened = true;
      const row: DayOpen = {
        date,
        openedAt: now.toISOString(),
        pettyCash,
        openedBy,
        closedAt: null,
      };
      if (current.some((day) => day.date === date)) {
        return current.map((day) => (day.date === date ? row : day));
      }
      return [row, ...current];
    });
    if (opened) sessionStorage.setItem("shift_started", now.toISOString());
  }, []);

  const endDay = useCallback(() => {
    if (orders.some((order) => order.status !== "paid")) {
      return "Pay or cancel open tickets before ending the day.";
    }
    const now = new Date().toISOString();
    let closed = false;
    setDays((current) => {
      if (!openBusinessDay(current)) return current;
      closed = true;
      return current.map((day) =>
        day.closedAt ? day : { ...day, closedAt: now },
      );
    });
    if (closed) sessionStorage.removeItem("shift_started");
    return null;
  }, [orders]);

  function updateSettings(patch: Partial<PosSettings>) {
    if (!requireCatalog()) return;
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
    sync,
    menu,
    categories,
    addCategory,
    renameCategory,
    deleteCategory,
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
    setOrderItemQty,
    billOrder,
    payOrder,
    deleteOrder,
    saveMenuItem,
    importMenuFromCsv,
    deleteMenuItem,
    moveMenuItem,
    refreshFloor,
    expenses,
    staff,
    addExpense,
    updateExpense,
    deleteExpense,
    addStaff,
    updateStaff,
    deleteStaff,
    recordWage,
    days,
    todayOpen,
    startDay,
    endDay,
    settings,
    updateSettings,
    canAmendCatalog: catalogOnline,
    resolveSyncConflict,
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
