import { useEffect, useMemo, useState } from "react";
import { lineTotal, rupees, stockLabel } from "../demo-data";
import { groupMenuSections, MenuSectionList, useMenuScroll } from "../menu-board";
import { usePos } from "../pos-store";
import type { PosOrder } from "../pos-types";
import { printGuestBill } from "../print-bill";
import { PayDialog } from "./PayDialog";
import { MenuItemCard } from "./MenuItemCard";

function statusLabel(order: PosOrder) {
  if (order.status === "paid") {
    return order.payment === "online" ? "Paid · online" : "Paid · cash";
  }
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
    orders,
    activeOrders,
    available,
    addItemToOrder,
    bumpOrderItem,
    billOrder,
    payOrder,
    settings,
    categories,
  } = usePos();
  const paidOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === "paid")
        .slice()
        .sort((a, b) => {
          if (a.date === b.date) return b.token - a.token;
          return a.date < b.date ? 1 : -1;
        }),
    [orders],
  );
  const [list, setList] = useState<"open" | "paid">("open");
  const [selectedId, setSelectedId] = useState<string | null>(
    focusOrderId ?? activeOrders[0]?.id ?? paidOrders[0]?.id ?? null,
  );
  const [paying, setPaying] = useState<{
    id: string;
    token: number;
    total: number;
  } | null>(null);
  const sections = useMemo(
    () => groupMenuSections(categories, menu),
    [categories, menu],
  );
  const sectionNames = useMemo(
    () => sections.map((section) => section.name),
    [sections],
  );
  const { scrollerRef, active, go } = useMenuScroll(sectionNames);
  const visible = list === "open" ? activeOrders : paidOrders;

  useEffect(() => {
    if (!focusOrderId) return;
    const focused = orders.find((order) => order.id === focusOrderId);
    if (!focused) return;
    setList(focused.status === "paid" ? "paid" : "open");
    setSelectedId(focusOrderId);
  }, [focusOrderId, orders]);

  const selected =
    visible.find((order) => order.id === selectedId) ?? visible[0] ?? null;
  const total = selected ? lineTotal(selected.lines) : 0;
  const past = selected?.status === "paid";

  if (activeOrders.length === 0 && paidOrders.length === 0) {
    return (
      <main className="page">
        <h1>Orders</h1>
        <p className="subhead">No tickets yet. Send an order from the Order screen.</p>
      </main>
    );
  }

  return (
    <div className="orders-layout">
      <aside className="order-rail" aria-label="Orders">
        <div className="order-rail-tabs" role="tablist" aria-label="Order lists">
          <button
            type="button"
            role="tab"
            aria-selected={list === "open"}
            className={list === "open" ? "rail-tab is-active" : "rail-tab"}
            onClick={() => {
              setList("open");
              setSelectedId(activeOrders[0]?.id ?? null);
            }}
          >
            Open
            <em>{activeOrders.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={list === "paid"}
            className={list === "paid" ? "rail-tab is-active" : "rail-tab"}
            onClick={() => {
              setList("paid");
              setSelectedId(paidOrders[0]?.id ?? null);
            }}
          >
            Paid
            <em>{paidOrders.length}</em>
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="rail-empty">
            {list === "open"
              ? "No open tickets."
              : "No paid orders stored on this till."}
          </p>
        ) : (
          visible.map((order) => (
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
              {order.status === "paid" ? (
                <span>
                  {order.date} · {order.time}
                </span>
              ) : null}
              <em>{rupees(lineTotal(order.lines))}</em>
            </button>
          ))
        )}
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
                {selected.status === "paid"
                  ? " · paid"
                  : selected.status === "billed"
                    ? " · bill printed"
                    : " · open"}
                {` · ${selected.date} · ${selected.time}`}
              </p>
            </div>
          </div>

          <div className={past ? "desk-grid is-past" : "desk-grid"}>
            <div className="ticket desk-ticket">
              <div className="ticket-head">
                <div>
                  <p className="ticket-kicker">{past ? "Paid order" : "Ticket"}</p>
                  <h2>{rupees(total)}</h2>
                </div>
              </div>
              <div className="ticket-body">
                {selected.lines.length === 0 ? (
                  <p className="empty-hint">
                    {past ? "This ticket has no lines." : "Add items from the menu"}
                  </p>
                ) : (
                  <ul className="ticket-lines">
                    {selected.lines.map((line) => (
                      <li key={line.id}>
                        <span>{line.name}</span>
                        {past ? (
                          <strong>{line.qty}</strong>
                        ) : (
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
                        )}
                        <em>{rupees(line.price * line.qty)}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="ticket-foot">
                {past ? (
                  <button
                    type="button"
                    className="btn-ink"
                    disabled={selected.lines.length === 0}
                    onClick={() => printGuestBill(selected, settings)}
                  >
                    Print bill
                    <span className="urdu">بل</span>
                  </button>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>

            {past ? (
              <div className="past-note">
                <h2>Guest copy</h2>
                <p>
                  This order is closed. Print the bill again if they need another
                  copy. Change the date range on Sales to find older tickets.
                </p>
              </div>
            ) : (
              <div className="desk-menu" ref={scrollerRef}>
                <div className="type-toggle compact-cats" role="tablist" aria-label="Categories">
                  {categories.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={active === name ? "cat-chip is-active" : "cat-chip"}
                      data-cat-nav={name}
                      onClick={() => go(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <MenuSectionList
                  sections={sections}
                  gridClass="item-grid photo-board"
                  renderItem={(item) => {
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
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {paying && (
        <PayDialog
          token={paying.token}
          total={paying.total}
          onClose={() => setPaying(null)}
          onPaid={(payment) => {
            if (selected) {
              printGuestBill({ ...selected, status: "paid", payment }, settings);
            }
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
