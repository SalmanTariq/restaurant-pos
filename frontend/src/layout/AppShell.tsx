import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { authClient, clearAuthToken } from "../auth-client";
import { rupees } from "../demo-data";
import { BrandLockup } from "./BrandLockup";
import { usePos } from "../pos-store";
import { SyncStatus } from "../screens/SyncStatus";
import type { Screen } from "../pos-types";

const PRIMARY_ALL: { id: Screen; label: string }[] = [
  { id: "order", label: "Order" },
  { id: "tables", label: "Tables" },
  { id: "orders", label: "Orders" },
  { id: "sales", label: "Sales" },
];

const MORE: { id: Screen; label: string }[] = [
  { id: "expenses", label: "Expenses" },
  { id: "balance", label: "Balance" },
];

function DockGlyph({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: Screen | "more";
}) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
  if (name === "order") {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  if (name === "tables") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 9v6M9 12h6" />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...common}>
        <path d="M8 4h8l2 4v12H6V8z" />
        <path d="M9 14h6M9 17h4" />
      </svg>
    );
  }
  if (name === "sales") {
    return (
      <svg {...common}>
        <path d="M4 18V6M4 18h16" />
        <path d="M8 14l4-5 3 3 5-7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function shiftLabel(openedAt?: string) {
  const started = openedAt ?? sessionStorage.getItem("shift_started");
  const date = started ? new Date(started) : new Date();
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AppShell({
  name,
  role,
  screen,
  onScreen,
  children,
}: {
  name: string;
  role?: string | null;
  screen: Screen;
  onScreen: (screen: Screen) => void;
  children: ReactNode;
}) {
  const { todayOpen, settings, sync, endDay } = usePos();
  const [moreOpen, setMoreOpen] = useState(false);
  const displayRole = role === "admin" ? "Admin" : "Cashier";
  const primary = settings.useTables
    ? PRIMARY_ALL
    : PRIMARY_ALL.filter((item) => item.id !== "tables");
  const moreItems = [
    ...MORE,
    ...(role === "admin" ? [{ id: "items" as const, label: "Items sold" }] : []),
    ...(role === "admin" ? [{ id: "inventory" as const, label: "Inventory" }] : []),
    ...(role === "admin" ? [{ id: "categories" as const, label: "Categories" }] : []),
    ...(role === "admin" ? [{ id: "users" as const, label: "Users" }] : []),
    ...(role === "admin" ? [{ id: "settings" as const, label: "Settings" }] : []),
  ];
  const desktopItems = [...primary, ...moreItems];
  const moreActive = moreItems.some((item) => item.id === screen);
  const dayLine = `Day ${todayOpen?.date ?? ""} · since ${shiftLabel(todayOpen?.openedAt)}${
    todayOpen && settings.requirePettyCash
      ? ` · petty ${rupees(todayOpen.pettyCash)}`
      : ""
  }`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(next: Screen) {
    onScreen(next);
    setMoreOpen(false);
  }

  function closeTill() {
    if (
      !window.confirm(
        "End this business day? The till will close. Sales after you open again go on the next day.",
      )
    ) {
      return;
    }
    const error = endDay();
    if (error) {
      window.alert(error);
      return;
    }
    setMoreOpen(false);
  }

  async function signOut() {
    await authClient.signOut();
    clearAuthToken();
  }

  return (
    <div className={moreOpen ? "shell is-more-open" : "shell"}>
      <header className="topbar">
        <BrandLockup />
        <nav className="nav" aria-label="Main">
          {desktopItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? "nav-btn is-active" : "nav-btn"}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-meta">
          <SyncStatus />
          <div className="user-chip">
            <strong>
              {name} — {displayRole}
            </strong>
            <span>{dayLine}</span>
            <div className="user-chip-actions">
              <button type="button" className="end-day-btn" onClick={closeTill}>
                End day
                <span className="urdu">دن بند کریں</span>
              </button>
              <button type="button" className="text-btn sign-out" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      {sync.status === "error" && sync.error ? (
        <p className="sync-banner" role="alert">
          Could not save to the server: {sync.error}
        </p>
      ) : null}

      <div className="shell-main">{children}</div>

      <nav className="dock" aria-label="Primary">
        {primary.map((item) => (
          <button
            key={item.id}
            type="button"
            className={screen === item.id ? "dock-btn is-active" : "dock-btn"}
            onClick={() => go(item.id)}
          >
            <DockGlyph name={item.id} />
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={moreActive || moreOpen ? "dock-btn is-active" : "dock-btn"}
          aria-expanded={moreOpen}
          aria-controls="more-sheet"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <DockGlyph name="more" />
          More
        </button>
      </nav>

      {moreOpen ? (
        <button
          type="button"
          className="more-scrim"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      <div
        id="more-sheet"
        className={moreOpen ? "more-sheet is-open" : "more-sheet"}
        role="dialog"
        aria-modal={moreOpen}
        aria-labelledby="more-title"
        aria-hidden={!moreOpen}
        {...(!moreOpen ? { inert: true } : {})}
      >
        <p id="more-title" className="more-kicker">
          More
        </p>
        <p className="more-user">
          <strong>
            {name} — {displayRole}
          </strong>
          <span>{dayLine}</span>
        </p>
        <div className="more-links">
          {moreItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? "more-link is-active" : "more-link"}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="end-day-btn more-end-day" onClick={closeTill}>
          End day
          <span className="urdu">دن بند کریں</span>
        </button>
        <button type="button" className="text-btn sign-out more-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
