import { FormEvent, useState } from "react";
import { rupees, todayISO } from "../demo-data";
import { authClient, clearAuthToken } from "../auth-client";
import { usePos } from "../pos-store";
import { BrandLockup } from "../layout/BrandLockup";
import { SyncStatus } from "./SyncStatus";

export function DayStartScreen({
  openedBy,
  askPettyCash = true,
}: {
  openedBy: string;
  askPettyCash?: boolean;
}) {
  const { days, startDay } = usePos();
  const last = days[0];
  const [amount, setAmount] = useState(
    last ? String(last.pettyCash) : "",
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = askPettyCash ? Number(amount) : 0;
    if (!Number.isFinite(value) || value < 0) return;
    startDay(value, openedBy);
  }

  return (
    <div className="login-page">
      <header className="topbar login-topbar">
        <BrandLockup />
        <SyncStatus />
      </header>

      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit}>
          <p className="login-kicker">Day start · {todayISO()}</p>
          <h1>{askPettyCash ? "Petty cash" : "Open the till"}</h1>
          <p className="login-lede urdu" lang="ur">
            {askPettyCash ? "خرد نقد" : "دن شروع کریں"}
          </p>
          <p className="subhead">
            {askPettyCash
              ? "Count the notes and coins in the drawer, then open the till."
              : "Yesterday’s till is closed. Open a new business day for tonight’s sales."}
          </p>

          {askPettyCash ? (
            <>
              <label htmlFor="petty-cash">Opening cash (Rs)</label>
              <input
                id="petty-cash"
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                required
                autoFocus
              />
            </>
          ) : null}
          {last ? (
            <p className="subhead">
              Last open: {last.date} · {rupees(last.pettyCash)}
              {last.closedAt ? " · closed" : ""}
            </p>
          ) : null}

          <button className="btn-tandoor" type="submit">
            Open the day
            <span className="urdu">دن شروع کریں</span>
          </button>
          <button
            type="button"
            className="ghost-btn modal-cancel"
            onClick={async () => {
              await authClient.signOut();
              clearAuthToken();
            }}
          >
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
