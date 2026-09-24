import { useEffect, useState } from "react";
import { rupees } from "../demo-data";
import type { PaymentMethod } from "../pos-types";

export function PayDialog({
  token,
  total,
  onClose,
  onPaid,
}: {
  token: number;
  total: number;
  onClose: () => void;
  onPaid: (payment: PaymentMethod, extras: { printBill: boolean }) => void;
}) {
  const [paidWith, setPaidWith] = useState<PaymentMethod | null>(null);
  const [printBill, setPrintBill] = useState(true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pay(method: PaymentMethod) {
    onPaid(method, { printBill });
    setPaidWith(method);
  }

  if (paidWith) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-title"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="login-kicker">Token {token}</p>
          <h2 id="pay-title">Paid</h2>
          <p className="subhead">
            {rupees(total)} · {paidWith === "cash" ? "Cash" : "Online"}
          </p>
          <button type="button" className="btn-pay" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="login-kicker">Token {token}</p>
        <h2 id="pay-title">Take payment</h2>
        <p className="pay-total">{rupees(total)}</p>
        <p className="urdu page-urdu" lang="ur">
          ادائیگی
        </p>
        <p className="subhead">Choose how they paid.</p>

        <label className="check-row" htmlFor="pay-print-bill">
          <input
            id="pay-print-bill"
            type="checkbox"
            checked={printBill}
            onChange={(event) => setPrintBill(event.currentTarget.checked)}
          />
          Print bill
          <span className="urdu">بل پرنٹ کریں</span>
        </label>

        <div className="pay-methods" role="group" aria-label="Payment method">
          <button
            type="button"
            className="type-btn is-cash-pay"
            onClick={() => pay("cash")}
          >
            Cash
            <span className="urdu">نقد</span>
          </button>
          <button
            type="button"
            className="type-btn is-card-pay"
            onClick={() => pay("online")}
          >
            Online
            <span className="urdu">آن لائن</span>
          </button>
        </div>

        <button type="button" className="ghost-btn modal-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
