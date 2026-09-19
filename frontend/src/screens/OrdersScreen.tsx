import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, lineTotal, rupees, stockLabel } from "../demo-data";
import { usePos } from "../pos-store";
import type { PosOrder } from "../pos-types";
import { printGuestBill } from "../print-bill";
import { PayDialog } from "./PayDialog";
import { MenuItemCard } from "./MenuItemCard";

function statusLabel(order: PosOrder) {
  if (order.status === "billed") return "Bill printed";
  return order.type === "takeaway" ? "Takeaway" : `Table ${order.tableId}`;
}

export function OrdersScreen({
  focusOrderId,
}: {
  focusOrderId?: string | null;
}) {
  const {
    menu,
    activeOrders,
    available,
    addItemToOrder,
    bumpOrderItem,
    billOrder,
    payOrder,
    settings,
  } = usePos();
  const [selectedId, setSelectedId] = useState<string | null>(
    focusOrderId ?? activeOrders[0]?.id ?? null,
  );
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [paying, setPaying] = useState<{
    id: string;
    token: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (focusOrderId) setSelectedId(focusOrderId);
  }, [focusOrderId]);

  const selected =
    activeOrders.find((order) => order.id === selectedId) ?? activeOrders[0] ?? null;
  const items = useMemo(
    () => menu.filter((item) => item.active && item.category === category),
    [menu, category],
  );
  const total = selected ? lineTotal(selected.lines) : 0;

  if (activeOrders.length === 0) {
    return (
      <main className="page">
        <h1>Active orders</h1>
        <p className="subhead">No open tickets. Send an order from the Order screen.</p>
      </main>
    );
  }

  return (
    <div className="orders-layout">
      <aside className="order-rail" aria-label="Active orders">
        {activeOrders.map((order) => (
          <button
            key={order.id}
            type="button"
            className={
              selected?.id === order.id
                ? `rail-card is-${order.status} is-picked`
                : `rail-card is-${order.status}`
            }
            onClick={() => setSelectedId(order.id)}
          >
            <strong>Token {order.token}</strong>
            <span>{statusLabel(order)}</span>
            <em>{rupees(lineTotal(order.lines))}</em>
          </button>
        ))}
      </aside>

      {selected && (
        <section className="order-desk">
          <div className="page-head">
            <div>
              <h1>Token {selected.token}</h1>
              <p className="subhead">
                {selected.type === "takeaway"
                  ? "Takeaway"
                  : `Table ${selected.tableId}`}
                {selected.status === "billed" ? " · bill printed" : " · open"}
                {` · ${selected.time}`}
              </p>
            </div>
          </div>

          <div className="desk-grid">
            <div className="ticket desk-ticket">
              <div className="ticket-head">
                <div>
                  <p className="ticket-kicker">Ticket</p>
                  <h2>{rupees(total)}</h2>
                </div>
              </div>
              <div className="ticket-body">
                {selected.lines.length === 0 ? (
                  <p className="empty-hint">Add items from the menu</p>
                ) : (
                  <ul className="ticket-lines">
                    {selected.lines.map((line) => (
                      <li key={line.id}>
                        <span>{line.name}</span>
                        <div className="qty">
                          <button
                            type="button"
                            onClick={() => bumpOrderItem(selected.id, line.id, -1)}
                            aria-label={`Remove ${line.name}`}
                          >
                            −
                          </button>
                          <strong>{line.qty}</strong>
                          <button
                            type="button"
                            onClick={() => bumpOrderItem(selected.id, line.id, 1)}
                            aria-label={`Add ${line.name}`}
                            disabled={available(line.id) <= 0}
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
                <button
                  type="button"
                  className="btn-ink"
                  disabled={selected.lines.length === 0}
                  onClick={() => {
                    printGuestBill(selected, settings);
                    billOrder(selected.id);
                  }}
                >
                  Generate bill
                  <span className="urdu">بل بنائیں</span>
                </button>
                <button
                  type="button"
                  className="btn-pay"
                  disabled={selected.lines.length === 0}
                  onClick={() =>
                    setPaying({
                      id: selected.id,
                      token: selected.token,
                      total,
                    })
                  }
                >
                  Pay
                  <span className="urdu">ادائیگی</span>
                </button>
              </div>
            </div>

            <div className="desk-menu">
              <div className="type-toggle compact-cats" role="tablist" aria-label="Categories">
                {CATEGORIES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={category === name ? "cat-chip is-active" : "cat-chip"}
                    onClick={() => setCategory(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="item-grid photo-board">
                {items.map((item) => {
                  const left = available(item.id);
                  const soldOut = settings.useInventory && left <= 0;
                  return (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      soldOut={soldOut}
                      prominent
                      stockLeft={left}
                      stockText={settings.useInventory ? stockLabel(left) : null}
                      onAdd={() => addItemToOrder(selected.id, item)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {paying && (
        <PayDialog
          token={paying.token}
          total={paying.total}
          onClose={() => setPaying(null)}
          onPaid={(payment) => {
            payOrder(paying.id, payment);
            setSelectedId(
              activeOrders.find((order) => order.id !== paying.id)?.id ?? null,
            );
          }}
        />
      )}
    </div>
  );
}
