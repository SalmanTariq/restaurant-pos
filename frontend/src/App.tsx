import { useEffect, useState } from "react";
import { authClient } from "./auth-client";
import { AppShell } from "./layout/AppShell";
import { PosProvider, usePos } from "./pos-store";
import { LoginScreen } from "./screens/LoginScreen";
import { OrderScreen } from "./screens/OrderScreen";
import { ExpensesScreen } from "./screens/ExpensesScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { OrdersScreen } from "./screens/OrdersScreen";
import { SalesScreen } from "./screens/SalesScreen";
import { BalanceScreen } from "./screens/BalanceScreen";
import { DayStartScreen } from "./screens/DayStartScreen";
import { TablesScreen } from "./screens/TablesScreen";
import { UsersScreen } from "./screens/UsersScreen";
import type { CartLine, OrderType, Screen } from "./pos-types";
import "./App.css";

function SignedIn({
  name,
  role,
}: {
  name: string;
  role?: string | null;
}) {
  const { tables, activeOrders, todayOpen } = usePos();
  const [screen, setScreen] = useState<Screen>("order");
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [tableId, setTableId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (tableId && !tables.some((table) => table.id === tableId)) {
      setTableId(null);
    }
  }, [tableId, tables]);

  function openTables() {
    setScreen("tables");
  }

  if (!todayOpen) {
    return <DayStartScreen openedBy={name} />;
  }

  return (
    <AppShell name={name} role={role} screen={screen} onScreen={setScreen}>
      {screen === "order" && (
        <OrderScreen
          orderType={orderType}
          tableId={tableId}
          cart={cart}
          onOrderType={(type) => {
            setOrderType(type);
            if (type === "takeaway") setTableId(null);
          }}
          onOpenTables={openTables}
          onCart={setCart}
        />
      )}
      {screen === "tables" && (
        <TablesScreen
          tables={tables}
          selected={tableId}
          onSelect={(id) => {
            const existing = activeOrders.find((order) => order.tableId === id);
            if (existing) {
              setFocusOrderId(existing.id);
              setScreen("orders");
              return;
            }
            setTableId(id);
            setOrderType("dine-in");
            setScreen("order");
          }}
          onBack={() => setScreen("order")}
        />
      )}
      {screen === "orders" && <OrdersScreen focusOrderId={focusOrderId} />}
      {screen === "sales" && (
        <SalesScreen onOpenExpenses={() => setScreen("expenses")} />
      )}
      {screen === "expenses" && <ExpensesScreen />}
      {screen === "balance" && <BalanceScreen />}
      {screen === "inventory" && role === "admin" && <InventoryScreen />}
      {screen === "users" && role === "admin" && <UsersScreen />}
    </AppShell>
  );
}

function App() {
  const { data: session, isPending, isRefetching } = authClient.useSession();

  if (isPending && !isRefetching) {
    return (
      <div className="login-page">
        <p className="boot">Opening Delhi Malik Nihari…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <PosProvider>
      <SignedIn name={session.user.name} role={session.user.role} />
    </PosProvider>
  );
}

export default App;
