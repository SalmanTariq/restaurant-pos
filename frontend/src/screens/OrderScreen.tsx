import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, lineTotal, rupees, stockLabel, stockTone } from "../demo-data";
import { usePos } from "../pos-store";
import type { CartLine, OrderType } from "../pos-types";
import { PayDialog } from "./PayDialog";

export function OrderScreen({
  orderType,
  tableId,
  cart,
  onOrderType,
  onOpenTables,
  onCart,
}: {
  orderType: OrderType;
  tableId: string | null;
  cart: CartLine[];
  onOrderType: (type: OrderType) => void;
  onOpenTables: () => void;
  onCart: (cart: CartLine[]) => void;
}) {
  const { menu, nextToken, available, placeOrder, settings } = usePos();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [paying, setPaying] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTicketOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(
    () => menu.filter((item) => item.active && item.category === category),
    [menu, category],
  );
  const total = lineTotal(cart);

  function addItem(id: string, name: string, price: number) {
    if (available(id, cart) <= 0) return;
    const existing = cart.find((line) => line.id === id);
    if (existing) {
      onCart(
        cart.map((line) =>
          line.id === id ? { ...line, qty: line.qty + 1 } : line,
        ),
      );
      return;
    }
    onCart([...cart, { id, name, price, qty: 1 }]);
  }

  function bump(id: string, delta: number) {
    if (delta > 0 && available(id, cart) <= 0) return;
    onCart(
      cart
        .map((line) =>
          line.id === id ? { ...line, qty: line.qty + delta } : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  function requireTable() {
    if (orderType === "dine-in" && !tableId) {
      onOpenTables();
      return false;
    }
    return true;
  }

  function sendTicket() {
    if (cart.length === 0 || !requireTable()) return;
    placeOrder({
      type: orderType,
      tableId,
      lines: cart,
      status: "open",
    });
    onCart([]);
    setTicketOpen(false);
  }

  return (
    <div className={ticketOpen ? "order-layout is-ticket-open" : "order-layout"}>
      <aside className="cats" aria-label="Menu categories">
        {CATEGORIES.map((name) => (
          <button
            key={name}
            type="button"
            className={category === name ? "cat-btn is-active" : "cat-btn"}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </aside>

      <section className="menu-pane">
        <div className="type-toggle" role="group" aria-label="Order type">
          <button
            type="button"
            className={orderType === "takeaway" ? "type-btn is-takeaway" : "type-btn"}
            onClick={() => onOrderType("takeaway")}
          >
            Takeaway
            <span className="urdu">پارسل</span>
          </button>
          <button
            type="button"
            className={orderType === "dine-in" ? "type-btn is-dine" : "type-btn"}
            onClick={() => {
              onOrderType("dine-in");
              if (!tableId) onOpenTables();
            }}
          >
            Dine-in
            <span className="urdu">میز</span>
          </button>
        </div>

        <div className="item-grid">
          {items.map((item) => {
            const left = available(item.id, cart);
            const soldOut = settings.useInventory && left <= 0;
            return (
              <button
                key={item.id}
                type="button"
                className={soldOut ? "item-card is-out" : "item-card"}
                disabled={soldOut}
                onClick={() => addItem(item.id, item.name, item.price)}
              >
                <span>{item.name}</span>
                <span className="item-meta">
                  <strong>{rupees(item.price)}</strong>
                  {settings.useInventory ? (
                    <em className={["stock-count", stockTone(left)].filter(Boolean).join(" ")}>
                      {stockLabel(left)}
                    </em>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="ticket-dock"
        onClick={() => setTicketOpen(true)}
      >
        <span>
          {count === 0
            ? "Ticket"
            : `${count} ${count === 1 ? "item" : "items"}`}
        </span>
        <strong>{rupees(total)}</strong>
      </button>

      {ticketOpen ? (
        <button
          type="button"
          className="ticket-scrim"
          aria-label="Close ticket"
          onClick={() => setTicketOpen(false)}
        />
      ) : null}

      <aside className={ticketOpen ? "ticket order-ticket is-open" : "ticket order-ticket"}>
        <div className="ticket-head">
          <div>
            <p className="ticket-kicker">Current order</p>
            <h2>
              {orderType === "takeaway"
                ? "Takeaway"
                : tableId
                  ? `Table ${tableId}`
                  : "Dine-in"}
            </h2>
          </div>
          <p className="token-chip">Token {nextToken}</p>
          <button
            type="button"
            className="ticket-close"
            onClick={() => setTicketOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="ticket-body">
          {cart.length === 0 ? (
            <p className="empty-hint">Tap items to add them</p>
          ) : (
            <ul className="ticket-lines">
              {cart.map((line) => (
                <li key={line.id}>
                  <span>{line.name}</span>
                  <div className="qty">
                    <button type="button" onClick={() => bump(line.id, -1)} aria-label={`Remove ${line.name}`}>
                      −
                    </button>
                    <strong>{line.qty}</strong>
                    <button
                      type="button"
                      onClick={() => bump(line.id, 1)}
                      aria-label={`Add ${line.name}`}
                      disabled={available(line.id, cart) <= 0}
                    >
                      +
                    </button>
                  </div>
                  <em>{rupees(line.price * line.qty)}</em>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ticket-foot">
          <div className="total-row">
            <span>
              Total
              <span className="urdu">کل رقم</span>
            </span>
            <strong>{rupees(total)}</strong>
          </div>
          <button type="button" className="btn-ink" disabled={cart.length === 0} onClick={sendTicket}>
            Send to orders
            <span className="urdu">آرڈر بھیجیں</span>
          </button>
          <button
            type="button"
            className="btn-pay"
            disabled={cart.length === 0}
            onClick={() => {
              if (!requireTable()) return;
              setTicketOpen(false);
              setPaying(true);
            }}
          >
            Pay
            <span className="urdu">ادائیگی</span>
          </button>
          <div className="ticket-actions">
            <button type="button" className="ghost-btn" onClick={() => onCart([])}>
              New order
            </button>
            <button type="button" className="ghost-btn" onClick={() => onCart([])}>
              Cancel
            </button>
          </div>
        </div>
      </aside>

      {paying && (
        <PayDialog
          token={nextToken}
          total={total}
          onClose={() => setPaying(false)}
          onPaid={(payment) => {
            placeOrder({
              type: orderType,
              tableId,
              lines: cart,
              status: "paid",
              payment,
            });
            onCart([]);
            setTicketOpen(false);
          }}
        />
      )}
    </div>
  );
}
