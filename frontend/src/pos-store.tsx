import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  diningFromLayout,
  lineTotal,
  loadLayout,
  MENU_ITEMS,
  NEXT_TOKEN,
  nowClock,
  SEED_ORDERS,
  todayISO,
} from "./demo-data";
import type {
  CartLine,
  DiningTable,
  ExpenseRow,
  MenuItem,
  PaymentMethod,
  PosOrder,
  StaffMember,
  TableStatus,
  DayOpen,
} from "./pos-types";

type PlaceInput = {
  type: PosOrder["type"];
  tableId: string | null;
  lines: CartLine[];
  status: "open" | "paid";
  payment?: PaymentMethod;
};

type PosContextValue = {
  menu: MenuItem[];
  orders: PosOrder[];
  nextToken: number;
  tables: DiningTable[];
  activeOrders: PosOrder[];
  available: (itemId: string, extra?: CartLine[]) => number;
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
};

const PosContext = createContext<PosContextValue | null>(null);
const ORDERS_KEY = "dmn_pos_orders";
const BOOKS_KEY = "dmn_pos_books";
const DAYS_KEY = "dmn_pos_days";

function normalizePayment(value: string | undefined): PaymentMethod | undefined {
  if (value === "online" || value === "card") return "online";
  if (value === "cash") return "cash";
  return undefined;
}

function loadSavedOrders(): { orders: PosOrder[]; nextToken: number } | null {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
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

function loadBooks(): { expenses: ExpenseRow[]; staff: StaffMember[] } {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
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

function loadDays(): DayOpen[] {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
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

export function PosProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuItem[]>(MENU_ITEMS);
  const [orders, setOrders] = useState<PosOrder[]>(
    () => loadSavedOrders()?.orders ?? SEED_ORDERS,
  );
  const [nextToken, setNextToken] = useState(
    () => loadSavedOrders()?.nextToken ?? NEXT_TOKEN,
  );
  const [floorRev, setFloorRev] = useState(0);
  const [expenses, setExpenses] = useState<ExpenseRow[]>(
    () => loadBooks().expenses,
  );
  const [staff, setStaff] = useState<StaffMember[]>(() => loadBooks().staff);
  const [days, setDays] = useState<DayOpen[]>(loadDays);

  useEffect(() => {
    localStorage.setItem(ORDERS_KEY, JSON.stringify({ orders, nextToken }));
  }, [orders, nextToken]);

  useEffect(() => {
    localStorage.setItem(BOOKS_KEY, JSON.stringify({ expenses, staff }));
  }, [expenses, staff]);

  useEffect(() => {
    localStorage.setItem(DAYS_KEY, JSON.stringify(days));
  }, [days]);

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "paid"),
    [orders],
  );

  const tables = useMemo<DiningTable[]>(() => {
    return diningFromLayout(loadLayout()).map((table) => {
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
  }, [activeOrders, floorRev]);

  function refreshFloor() {
    setFloorRev((value) => value + 1);
  }

  function available(itemId: string, extra: CartLine[] = []) {
    const item = menu.find((entry) => entry.id === itemId);
    if (!item) return 0;
    return Math.max(0, item.stock - reservedQty(itemId, orders, extra));
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
    if (input.status === "paid") {
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
    setMenu((current) => consumeStock(current, target.lines));
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

  const value: PosContextValue = {
    menu,
    orders,
    nextToken,
    tables,
    activeOrders,
    available,
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
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const value = useContext(PosContext);
  if (!value) throw new Error("usePos must be used inside PosProvider");
  return value;
}

export { lineTotal };
