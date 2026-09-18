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
import { PlatformScreen } from "./screens/PlatformScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
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
  const { ready, tables, activeOrders, todayOpen, settings, startDay } = usePos();
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

  useEffect(() => {
    if (!settings.requirePettyCash && !todayOpen) {
      startDay(0, name);
    }
  }, [name, settings.requirePettyCash, startDay, todayOpen]);

  useEffect(() => {
    if (screen === "inventory" && !settings.useInventory) {
      setScreen("order");
    }
  }, [screen, settings.useInventory]);

  function openTables() {
    setScreen("tables");
  }

  if (!ready) {
    return (
      <div className="login-page">
        <p className="boot">Opening {settings.restaurantName}…</p>
      </div>
    );
  }

  if (settings.requirePettyCash && !todayOpen) {
    return <DayStartScreen openedBy={name} />;
  }

  if (!todayOpen) {
    return (
      <div className="login-page">
        <p className="boot">Opening {settings.restaurantName}…</p>
      </div>
    );
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
      {screen === "inventory" && role === "admin" && settings.useInventory && (
        <InventoryScreen />
      )}
      {screen === "users" && role === "admin" && <UsersScreen />}
      {screen === "settings" && role === "admin" && <SettingsScreen />}
    </AppShell>
  );
}

function App() {
  const { data: session, isPending, isRefetching } = authClient.useSession();
  const role = session?.user.role;
  const restaurantId = (
    session?.user as { restaurantId?: string | null } | undefined
  )?.restaurantId;

  if (isPending && !isRefetching) {
    return (
      <div className="login-page">
        <p className="boot">Opening POS…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (role === "platform") {
    return <PlatformScreen name={session.user.name} />;
  }

  if (!restaurantId) {
    return (
      <div className="login-page">
        <p className="boot">This account is not linked to a restaurant.</p>
      </div>
    );
  }

  return (
    <PosProvider restaurantId={restaurantId}>
      <SignedIn name={session.user.name} role={role} />
    </PosProvider>
  );
}

export default App;
