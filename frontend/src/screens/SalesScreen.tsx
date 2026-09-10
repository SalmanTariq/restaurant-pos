import { useMemo, useState } from "react";
import {
  inDateRange,
  itemsLabel,
  lineTotal,
  rupees,
  todayISO,
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
  const { orders, expenses, days } = usePos();
  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<"all" | PaymentMethod>("all");
  const [orderType, setOrderType] = useState<"all" | OrderType>("all");

  const paid = useMemo(
    () => orders.filter((order) => order.status === "paid" && order.payment),
    [orders],
  );

  const inRange = useMemo(
    () => paid.filter((order) => inDateRange(order.date, from, to)),
    [paid, from, to],
  );

  const dated = useMemo(() => inRange.map(toSaleRow), [inRange]);

  const expenseTotal = useMemo(
    () =>
      expenses
        .filter((row) => inDateRange(row.date, from, to))
        .reduce((sum, row) => sum + row.amount, 0),
    [expenses, from, to],
  );

  const cash = dated
    .filter((row) => row.payment === "cash")
    .reduce((sum, row) => sum + row.total, 0);
  const online = dated
    .filter((row) => row.payment === "online")
    .reduce((sum, row) => sum + row.total, 0);
  const pettyCash = days
    .filter((day) => inDateRange(day.date, from, to))
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

  function exportSales(format: ExportFormat) {
    downloadReport(
      {
        basename: `delhi-malik-nihari-sales-${fileStamp(from, to)}`,
        title: "Delhi Malik Nihari - Sales",
        subtitle: `${rangeLabel(from, to)} · ${rows.length} orders · ${rupees(filteredTotal)}`,
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
            {from === to ? from : `${from} → ${to}`}
            {from === today && to === today && todayOpen
              ? ` — day opened ${clockFromIso(todayOpen.openedAt)}.`
              : "."}
          </p>
        </div>
        <div className="head-tools">
          <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <ExportButtons disabled={rows.length === 0} onExport={exportSales} />
          <div className="dash-kpis">
            <p>
              Petty cash
              <strong>{rupees(pettyCash)}</strong>
            </p>
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
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No paid orders in this range yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
