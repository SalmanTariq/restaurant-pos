import { useEffect, useMemo, useState } from "react";
import { lineTotal, rupees, stockLabel } from "../demo-data";
import { groupMenuSections, MenuSectionList, useMenuScroll } from "../menu-board";
import { usePos } from "../pos-store";
import type { CartLine, OrderType } from "../pos-types";
import { printGuestBill, printKitchenToken } from "../print-bill";
import { PayDialog } from "./PayDialog";
import { MenuItemCard } from "./MenuItemCard";
import { QtyStepper } from "./QtyStepper";

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
  const { menu, nextToken, available, placeOrder, settings, categories } = usePos();
  const [paying, setPaying] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  const sections = useMemo(
    () => groupMenuSections(categories, menu),
    [categories, menu],
  );
  const sectionNames = useMemo(
    () => sections.map((section) => section.name),
    [sections],
  );
  const { scrollerRef, active, go } = useMenuScroll(sectionNames);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTicketOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function setQty(id: string, qty: number) {
    const line = cart.find((entry) => entry.id === id);
    if (!line) return;
    const max = line.qty + available(id, cart);
    const n = Math.floor(qty);
    if (!Number.isFinite(n) || n <= 0) {
      onCart(cart.filter((entry) => entry.id !== id));
      return;
    }
    onCart(
      cart.map((entry) =>
        entry.id === id ? { ...entry, qty: Math.min(n, max) } : entry,
      ),
    );
  }

  function requireTable() {
    if (orderType === "dine-in" && !tableId) {
      onOpenTables();
      return false;
    }
    return true;
  }

  return (
    <div className={ticketOpen ? "order-layout is-ticket-open" : "order-layout"}>
      <aside className="cats" aria-label="Menu categories">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            className={active === name ? "cat-btn is-active" : "cat-btn"}
            data-cat-nav={name}
            onClick={() => go(name)}
          >
            {name}
          </button>
        ))}
      </aside>

      <div className="menu-pane" ref={scrollerRef}>
        <div className="type-toggle" role="group" aria-label="Order type">
          <button
            type="button"
            className={orderType === "takeaway" ? "type-btn is-takeaway" : "type-btn"}
            onClick={() => onOrderType("takeaway")}
          >
            Takeaway
            <span className="urdu">پارسل</span>
          </button>
          {settings.useTables ? (
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
          ) : null}
        </div>

        <MenuSectionList
          sections={sections}
          gridClass="item-grid photo-board"
          renderItem={(item) => {
            const left = available(item.id, cart);
            const soldOut = settings.useInventory && left <= 0;
            return (
              <MenuItemCard
                key={item.id}
                item={item}
                soldOut={soldOut}
                stockLeft={left}
                stockText={settings.useInventory ? stockLabel(left) : null}
                onAdd={() => addItem(item.id, item.name, item.price)}
              />
            );
          }}
        />
      </div>

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
                    <QtyStepper
                      name={line.name}
                      value={line.qty}
                      max={line.qty + available(line.id, cart)}
                      onChange={(qty) => setQty(line.id, qty)}
                    />
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
          <button
            type="button"
            className="btn-ink"
            disabled
            title="Send to orders is turned off. Use Pay instead."
          >
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
          onPaid={(payment, { printBill }) => {
            const order = placeOrder({
              type: orderType,
              tableId,
              lines: cart,
              status: "paid",
              payment,
            });
            void printKitchenToken(order, settings, menu, categories).then(() => {
              if (printBill) return printGuestBill(order, settings);
            });
            onCart([]);
            setTicketOpen(false);
          }}
        />
      )}
    </div>
  );
}
