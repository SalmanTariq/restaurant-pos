import { useMemo, useState } from "react";
import {
  itemsLabel,
  lineTotal,
  rupees,
  defaultReportRange,
  todayISO,
  inDateTimeRange,
  START_OF_DAY,
  END_OF_DAY,
} from "../demo-data";
import { usePos } from "../pos-store";
import type { OrderType, PaymentMethod, PosOrder, SaleRow } from "../pos-types";
import {
  downloadReport,
  fileStamp,
  rangeLabel,
  type ExportFormat,
} from "../export-report";
import { DateRangeFields } from "./DateRangeFields";
import { ExportButtons } from "./ExportButtons";
import { printGuestBill } from "../print-bill";
import { restaurantSlug } from "../settings";

function clockFromIso(value?: string) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toSaleRow(order: PosOrder): SaleRow {
  return {
    id: order.id,
    token: order.token,
    date: order.date,
    time: order.time,
    type: order.type,
    table: order.tableId ?? undefined,
    items: itemsLabel(order.lines),
    payment: order.payment ?? "cash",
    total: lineTotal(order.lines),
  };
}

function topFromOrders(orders: PosOrder[]) {
  const tally = new Map<string, { sold: number; amount: number }>();
  for (const order of orders) {
    for (const line of order.lines) {
      const current = tally.get(line.name) ?? { sold: 0, amount: 0 };
      current.sold += line.qty;
      current.amount += line.qty * line.price;
      tally.set(line.name, current);
    }
  }
  return [...tally.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

export function SalesScreen({
  onOpenExpenses,
}: {
  onOpenExpenses: () => void;
}) {
  const { orders, expenses, days, settings } = usePos();
  const today = todayISO();
  const initialRange = defaultReportRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [fromTime, setFromTime] = useState(initialRange.fromTime);
  const [toTime, setToTime] = useState(initialRange.toTime);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<"all" | PaymentMethod>("all");
  const [orderType, setOrderType] = useState<"all" | OrderType>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const paid = useMemo(
    () => orders.filter((order) => order.status === "paid" && order.payment),
    [orders],
  );

  const inRange = useMemo(
    () =>
      paid.filter((order) =>
        inDateTimeRange(order.date, order.time, from, fromTime, to, toTime),
      ),
    [paid, from, fromTime, to, toTime],
  );

  const dated = useMemo(() => inRange.map(toSaleRow), [inRange]);

  const expenseTotal = useMemo(
    () =>
      expenses
        .filter((row) =>
          inDateTimeRange(row.date, undefined, from, fromTime, to, toTime),
        )
        .reduce((sum, row) => sum + row.amount, 0),
    [expenses, from, fromTime, to, toTime],
  );

  const cash = dated
    .filter((row) => row.payment === "cash")
    .reduce((sum, row) => sum + row.total, 0);
  const online = dated
    .filter((row) => row.payment === "online")
    .reduce((sum, row) => sum + row.total, 0);
  const pettyCash = days
    .filter((day) =>
      inDateTimeRange(day.date, undefined, from, fromTime, to, toTime),
    )
    .reduce((sum, day) => sum + day.pettyCash, 0);
  const cashInDrawer = pettyCash + cash - expenseTotal;
  const topItems = topFromOrders(inRange);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dated.filter((row) => {
      if (payment !== "all" && row.payment !== payment) return false;
      if (orderType !== "all" && row.type !== orderType) return false;
      if (!needle) return true;
      return (
        String(row.token).includes(needle) ||
        row.items.toLowerCase().includes(needle) ||
        (row.table ?? "").toLowerCase().includes(needle) ||
        row.payment.includes(needle) ||
        row.type.includes(needle)
      );
    });
  }, [dated, query, payment, orderType]);

  const filteredTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const openOrder = inRange.find((order) => order.id === openId) ?? null;

  function reprint(order: PosOrder) {
    printGuestBill(order, settings);
  }

  function exportSales(format: ExportFormat) {
    downloadReport(
      {
        basename: `${restaurantSlug(settings.restaurantName)}-sales-${fileStamp(from, to, fromTime, toTime)}`,
        title: `${settings.restaurantName} - Sales`,
        subtitle: `${rangeLabel(from, to, fromTime, toTime)} · ${rows.length} orders · ${rupees(filteredTotal)}`,
        headers: ["Token", "Date", "Time", "Type", "Items", "Payment", "Amount"],
        rows: rows.map((row) => [
          row.token,
          row.date,
          row.time,
          row.type === "dine-in" ? `Table ${row.table}` : "Takeaway",
          row.items,
          row.payment,
          row.total,
        ]),
        totalLabel: "Total",
        totalValue: filteredTotal,
      },
      format,
    );
  }

  const todayOpen = days.find((day) => day.date === today);

  return (
    <main className="page sales-page">
      <div className="page-head">
        <div>
          <h1>Sales</h1>
          <p className="subhead">
            {rangeLabel(from, to, fromTime, toTime)}
            {from === today && to === today && todayOpen
              ? ` — day opened ${clockFromIso(todayOpen.openedAt)}.`
              : "."}{" "}
            Open a paid order to reprint the guest bill.
          </p>
        </div>
        <div className="head-tools">
          <div className="range-row">
            <DateRangeFields
              from={from}
              to={to}
              fromTime={fromTime}
              toTime={toTime}
              onFrom={setFrom}
              onTo={setTo}
              onFromTime={setFromTime}
              onToTime={setToTime}
            />
            <button
              type="button"
              className="range-today"
              disabled={
                from === today &&
                to === today &&
                fromTime === START_OF_DAY &&
                toTime === END_OF_DAY
              }
              onClick={() => {
                const day = todayISO();
                setFrom(day);
                setTo(day);
                setFromTime(START_OF_DAY);
                setToTime(END_OF_DAY);
              }}
            >
              Today
            </button>
          </div>
          <ExportButtons disabled={rows.length === 0} onExport={exportSales} />
          <div className="dash-kpis">
            {settings.requirePettyCash ? (
              <p>
                Petty cash
                <strong>{rupees(pettyCash)}</strong>
              </p>
            ) : null}
            <p>
              Cash in drawer
              <strong>{rupees(cashInDrawer)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="metric-row">
        <button
          type="button"
          className={payment === "cash" ? "metric cash is-filtered" : "metric cash"}
          onClick={() => setPayment(payment === "cash" ? "all" : "cash")}
        >
          <span>Cash sales</span>
          <strong>{rupees(cash)}</strong>
        </button>
        <button
          type="button"
          className={payment === "online" ? "metric card is-filtered" : "metric card"}
          onClick={() => setPayment(payment === "online" ? "all" : "online")}
        >
          <span>Online sales</span>
          <strong>{rupees(online)}</strong>
        </button>
        <button
          type="button"
          className="metric paper"
          onClick={() => {
            setPayment("all");
            setOrderType("all");
            setQuery("");
          }}
        >
          <span>Orders</span>
          <strong>{dated.length}</strong>
        </button>
        <button type="button" className="metric paper" onClick={onOpenExpenses}>
          <span>Expenses</span>
          <strong>{rupees(expenseTotal)}</strong>
        </button>
      </div>

      <ul className="top-pills">
        {topItems.map((item) => (
          <li key={item.name}>
            <span>{item.name}</span>
            <strong>{item.sold} sold</strong>
            <em>{rupees(item.amount)}</em>
          </li>
        ))}
      </ul>

      <section className="data-panel">
        <div className="filter-bar">
          <label className="filter-search">
            <span>Search orders</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Token, item, table…"
            />
          </label>
          <label>
            <span>Payment</span>
            <select
              value={payment}
              onChange={(event) =>
                setPayment(event.currentTarget.value as "all" | PaymentMethod)
              }
            >
              <option value="all">All</option>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
          </label>
          <label>
            <span>Type</span>
            <select
              value={orderType}
              onChange={(event) =>
                setOrderType(event.currentTarget.value as "all" | OrderType)
              }
            >
              <option value="all">All</option>
              <option value="takeaway">Takeaway</option>
              <option value="dine-in">Dine-in</option>
            </select>
          </label>
          <p className="filter-count">
            {rows.length} of {dated.length} · {rupees(filteredTotal)}
          </p>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Date</th>
                <th>Time</th>
                <th>Type</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No paid orders in this range yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={openId === row.id ? "sale-row is-open" : "sale-row"}
                    onClick={() => setOpenId(row.id)}
                  >
                    <td>#{row.token}</td>
                    <td>{row.date}</td>
                    <td>{row.time}</td>
                    <td>
                      {row.type === "dine-in"
                        ? `Table ${row.table}`
                        : "Takeaway"}
                    </td>
                    <td>{row.items}</td>
                    <td>
                      <span className={`pay-pill is-${row.payment}`}>
                        {row.payment}
                      </span>
                    </td>
                    <td className="num">{rupees(row.total)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          const order = inRange.find((entry) => entry.id === row.id);
                          if (order) reprint(order);
                        }}
                      >
                        Print bill
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {openOrder ? (
        <div className="modal-backdrop" onClick={() => setOpenId(null)}>
          <div
            className="modal sale-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="past-order-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="past-order-title">Token {openOrder.token}</h2>
            <p className="subhead">
              {openOrder.type === "dine-in"
                ? `Table ${openOrder.tableId}`
                : "Takeaway"}
              {` · ${openOrder.date} · ${openOrder.time}`}
              {openOrder.payment
                ? ` · paid ${openOrder.payment}`
                : ""}
            </p>
            <ul className="ticket-lines sale-lines">
              {openOrder.lines.map((line) => (
                <li key={line.id}>
                  <span>
                    {line.name}
                    <em> × {line.qty}</em>
                  </span>
                  <strong>{rupees(line.price * line.qty)}</strong>
                </li>
              ))}
            </ul>
            <p className="sale-total">
              <span>Total</span>
              <strong>{rupees(lineTotal(openOrder.lines))}</strong>
            </p>
            <button
              className="btn-ink"
              type="button"
              onClick={() => reprint(openOrder)}
            >
              Print bill
            </button>
            <button
              className="ghost-btn modal-cancel"
              type="button"
              onClick={() => setOpenId(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
