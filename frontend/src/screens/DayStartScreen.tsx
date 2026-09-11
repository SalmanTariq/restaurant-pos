import { FormEvent, useState } from "react";
import { rupees, todayISO } from "../demo-data";
import { authClient, clearAuthToken } from "../auth-client";
import { usePos } from "../pos-store";
import { BrandLockup } from "../layout/BrandLockup";
import { SyncStatus } from "./SyncStatus";

export function DayStartScreen({ openedBy }: { openedBy: string }) {
  const { days, startDay } = usePos();
  const last = days[0];
  const [amount, setAmount] = useState(
    last ? String(last.pettyCash) : "",
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
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
          <h1>Petty cash</h1>
          <p className="login-lede urdu" lang="ur">
            خرد نقد
          </p>
          <p className="subhead">
            Count the notes and coins in the drawer, then open the till.
          </p>

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
          {last ? (
            <p className="subhead">
              Last open: {last.date} · {rupees(last.pettyCash)}
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
