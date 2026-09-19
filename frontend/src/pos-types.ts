export type Screen =
  | "order"
  | "tables"
  | "orders"
  | "sales"
  | "expenses"
  | "balance"
  | "inventory"
  | "users"
  | "settings";
export type OrderType = "takeaway" | "dine-in";
export type TableStatus = "free" | "seated" | "bill";
export type PaymentMethod = "cash" | "online";
export type PosOrderStatus = "open" | "billed" | "paid";

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
  imageDataUrl?: string | null;
};

export type CartLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type DiningTable = {
  id: string;
  label: string;
  status: TableStatus;
  itemCount?: number;
};

export type TableLayout = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "round" | "rect";
  kind?: "table" | "counter";
};

export type TokenTicket = {
  id: string;
  number: number;
  type: OrderType;
  table?: string;
  items: string;
  total: number;
  time: string;
};

export type SaleRow = {
  id: string;
  token: number;
  date: string;
  time: string;
  type: OrderType;
  table?: string;
  items: string;
  payment: PaymentMethod;
  total: number;
};

export type ExpenseRow = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  notes: string;
  staffId?: string;
};

export type StaffMember = {
  id: string;
  name: string;
  dailyWage: number;
};

export type DayOpen = {
  date: string;
  openedAt: string;
  pettyCash: number;
  openedBy: string;
};

export type PosSettings = {
  restaurantName: string;
  logoDataUrl: string | null;
  requirePettyCash: boolean;
  useInventory: boolean;
};

export type PosOrder = {
  id: string;
  token: number;
  type: OrderType;
  tableId: string | null;
  lines: CartLine[];
  status: PosOrderStatus;
  date: string;
  time: string;
  payment?: PaymentMethod;
  collected?: number;
  change?: number;
};

export type TillSnapshot = {
  menu: MenuItem[];
  orders: PosOrder[];
  nextToken: number;
  expenses: ExpenseRow[];
  staff: StaffMember[];
  days: DayOpen[];
  settings: PosSettings;
  layout: TableLayout[];
};
