import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { authClient, clearAuthToken } from "../auth-client";
import { BrandLockup } from "../layout/BrandLockup";
import { SyncStatus } from "./SyncStatus";

type RestaurantRow = {
  id: string;
  name: string;
  status: "active" | "disabled";
  ownerEmail: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export function PlatformScreen({ name }: { name: string }) {
  const [shops, setShops] = useState<RestaurantRow[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [resetShop, setResetShop] = useState<RestaurantRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetSaved, setResetSaved] = useState("");
  const [clearPendingId, setClearPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/platform") {
      window.history.replaceState({}, "", "/platform");
    }
  }, []);

  async function loadShops() {
    try {
      const rows = await api<RestaurantRow[]>("/platform/restaurants");
      setShops(rows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load restaurants");
    }
  }

  useEffect(() => {
    document.title = "Control panel";
    void loadShops();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api("/platform/restaurants", {
        method: "POST",
        body: JSON.stringify({
          name: restaurantName,
          ownerName,
          ownerEmail,
          ownerPassword,
        }),
      });
      setRestaurantName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      await loadShops();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create restaurant",
      );
    } finally {
      setPending(false);
    }
  }

  async function setStatus(id: string, status: "active" | "disabled") {
    setError("");
    try {
      await api(`/platform/restaurants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadShops();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update restaurant",
      );
    }
  }

  async function clearSales(shop: RestaurantRow) {
    const ok = window.confirm(
      `Clear all orders and sales for “${shop.name}”? Menu and stock stay. Staff must hard-refresh the till afterward.`,
    );
    if (!ok) return;
    setError("");
    setResetSaved("");
    setClearPendingId(shop.id);
    try {
      const result = await api<{
        clearedOrders: number;
        clearedDays: number;
      }>(`/platform/restaurants/${shop.id}/clear-sales`, {
        method: "POST",
        body: "{}",
      });
      setResetSaved(
        `Cleared ${result.clearedOrders} order(s) and ${result.clearedDays} day(s) for ${shop.name}. Hard-refresh open tills.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not clear sales",
      );
    } finally {
      setClearPendingId(null);
    }
  }

  function startReset(shop: RestaurantRow) {
    setError("");
    setResetSaved("");
    setResetPassword("");
    setResetShop(shop);
  }

  async function onResetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetShop) return;
    setError("");
    setResetSaved("");
    setResetPending(true);
    try {
      await api(`/platform/restaurants/${resetShop.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetSaved(`Password updated for ${resetShop.name}.`);
      setResetPassword("");
      setResetShop(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset password",
      );
    } finally {
      setResetPending(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    clearAuthToken();
  }

  return (
    <div className="shell platform-shell">
      <header className="topbar">
        <BrandLockup name="Control panel" />
        <div className="topbar-meta">
          <SyncStatus />
          <div className="user-chip">
            <strong>{name} — Platform</strong>
            <span>Restaurants</span>
            <button type="button" className="text-btn sign-out" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="page users-page">
        <div className="page-head">
          <div>
            <h1>Restaurants</h1>
            <p className="subhead">
              Add a shop and its owner. Disable to block the next sign-in.
              Reset password if they are locked out.
            </p>
          </div>
        </div>

        <div className="users-layout">
          {resetShop ? (
            <form className="login-card users-form" onSubmit={onResetPassword}>
              <h2>Reset password</h2>
              <p className="subhead">
                {resetShop.name}
                {resetShop.ownerEmail ? ` · ${resetShop.ownerEmail}` : ""}
              </p>
              <label htmlFor="reset-password">New owner password</label>
              <input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.currentTarget.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn-tandoor" type="submit" disabled={resetPending}>
                {resetPending ? "Saving…" : "Save password"}
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setResetShop(null);
                  setResetPassword("");
                  setError("");
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <form className="login-card users-form" onSubmit={onCreate}>
              <h2>Add restaurant</h2>
              <label htmlFor="shop-name">Restaurant name</label>
              <input
                id="shop-name"
                type="text"
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.currentTarget.value)}
                required
              />
              <label htmlFor="owner-name">Owner name</label>
              <input
                id="owner-name"
                type="text"
                value={ownerName}
                onChange={(event) => setOwnerName(event.currentTarget.value)}
                autoComplete="name"
                required
              />
              <label htmlFor="owner-email">Owner email</label>
              <input
                id="owner-email"
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.currentTarget.value)}
                autoComplete="off"
                required
              />
              <label htmlFor="owner-password">Owner password</label>
              <input
                id="owner-password"
                type="password"
                value={ownerPassword}
                onChange={(event) => setOwnerPassword(event.currentTarget.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              {resetSaved && (
                <p className="settings-saved" role="status">
                  {resetSaved}
                </p>
              )}
              <button className="btn-tandoor" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create restaurant"}
              </button>
            </form>
          )}

          <section className="top-items staff-table shop-table">
            <header>
              <h2>Accounts</h2>
              <p>
                <span>Owner</span>
                <span>Status</span>
                <span>Last login</span>
                <span />
              </p>
            </header>
            <ul>
              {shops.length === 0 ? (
                <li className="shop-empty">No restaurants yet.</li>
              ) : (
                shops.map((shop) => (
                  <li key={shop.id}>
                    <span>{shop.name}</span>
                    <span className="sold">{shop.ownerEmail ?? "—"}</span>
                    <strong
                      className={
                        shop.status === "disabled"
                          ? "shop-status is-disabled"
                          : "shop-status is-active"
                      }
                    >
                      {shop.status}
                    </strong>
                    <span className="sold">{formatWhen(shop.lastLoginAt)}</span>
                    <span className="shop-actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() =>
                          setStatus(
                            shop.id,
                            shop.status === "disabled" ? "active" : "disabled",
                          )
                        }
                      >
                        {shop.status === "disabled" ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => startReset(shop)}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="text-btn shop-clear-sales"
                        disabled={clearPendingId === shop.id}
                        onClick={() => void clearSales(shop)}
                      >
                        {clearPendingId === shop.id
                          ? "Clearing…"
                          : "Clear sales"}
                      </button>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
