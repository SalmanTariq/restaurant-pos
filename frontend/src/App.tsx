import { useEffect, useRef, useState } from "react";
import { authClient } from "./auth-client";
import { useShopRoute } from "./app-route";
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
import { CategoriesScreen } from "./screens/CategoriesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TablesScreen } from "./screens/TablesScreen";
import { UsersScreen } from "./screens/UsersScreen";
import type { CartLine, OrderType } from "./pos-types";
import "./App.css";

function SignedIn({
  name,
  role,
}: {
  name: string;
  role?: string | null;
}) {
  const { ready, tables, activeOrders, todayOpen, settings, startDay } = usePos();
  const { screen, ticketId, go } = useShopRoute(role);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [tableId, setTableId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

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
    if (screen === "inventory" && role !== "admin") {
      go("order", null, true);
    }
  }, [go, role, screen]);

  function openTables() {
    go("tables");
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
    <AppShell name={name} role={role} screen={screen} onScreen={(next) => go(next)}>
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
              go("orders", existing.id);
              return;
            }
            setTableId(id);
            setOrderType("dine-in");
            go("order");
          }}
          onBack={() => go("order")}
        />
      )}
      {screen === "orders" && <OrdersScreen focusOrderId={ticketId} />}
      {screen === "sales" && (
        <SalesScreen onOpenExpenses={() => go("expenses")} />
      )}
      {screen === "expenses" && <ExpensesScreen />}
      {screen === "balance" && <BalanceScreen />}
      {screen === "inventory" && role === "admin" && <InventoryScreen />}
      {screen === "categories" && role === "admin" && <CategoriesScreen />}
      {screen === "users" && role === "admin" && <UsersScreen />}
      {screen === "settings" && role === "admin" && <SettingsScreen />}
    </AppShell>
  );
}

function App() {
  const { data: session, isPending, isRefetching } = authClient.useSession();
  const heldSession = useRef(session);
  if (session) heldSession.current = session;
  if (!session && !isPending && !isRefetching) heldSession.current = null;
  const view = session ?? heldSession.current;
  const role = view?.user.role;
  const restaurantId = (
    view?.user as { restaurantId?: string | null } | undefined
  )?.restaurantId;

  if (!view) {
    if (isPending && !isRefetching) {
      return (
        <div className="login-page">
          <p className="boot">Opening POS…</p>
        </div>
      );
    }
    return <LoginScreen />;
  }

  if (role === "platform") {
    return <PlatformScreen name={view.user.name} />;
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
      <SignedIn name={view.user.name} role={role} />
    </PosProvider>
  );
}

export default App;
