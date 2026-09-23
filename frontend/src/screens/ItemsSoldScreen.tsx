import { useMemo, useState } from "react";
import { inDateRange, rupees, todayISO } from "../demo-data";
import {
  downloadReport,
  fileStamp,
  rangeLabel,
  type ExportFormat,
} from "../export-report";
import { usePos } from "../pos-store";
import { restaurantSlug } from "../settings";
import { DateRangeFields } from "./DateRangeFields";
import { ExportButtons } from "./ExportButtons";

type SoldRow = {
  id: string;
  name: string;
  category: string;
  qty: number;
  amount: number;
};

export function ItemsSoldScreen() {
  const { orders, menu, settings } = usePos();
  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const tally = new Map<string, SoldRow>();
    for (const order of orders) {
      if (order.status !== "paid") continue;
      if (!inDateRange(order.date, from, to)) continue;
      for (const line of order.lines) {
        const category =
          menu.find((item) => item.id === line.id)?.category ?? "Other";
        const key = `${line.id}:${line.name}`;
        const current = tally.get(key) ?? {
          id: line.id,
          name: line.name,
          category,
          qty: 0,
          amount: 0,
        };
        current.qty += line.qty;
        current.amount += line.qty * line.price;
        tally.set(key, current);
      }
    }
    const needle = query.trim().toLowerCase();
    return [...tally.values()]
      .filter((row) => {
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          row.category.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  }, [from, menu, orders, query, to]);

  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  function exportItems(format: ExportFormat) {
    downloadReport(
      {
        basename: `${restaurantSlug(settings.restaurantName)}-items-${fileStamp(from, to)}`,
        title: `${settings.restaurantName} - Items sold`,
        subtitle: `${rangeLabel(from, to)} · ${rows.length} items · ${totalQty} sold · ${rupees(totalAmount)}`,
        headers: ["Item", "Category", "Qty sold", "Amount"],
        rows: rows.map((row) => [row.name, row.category, row.qty, row.amount]),
        totalLabel: "Total",
        totalValue: totalAmount,
      },
      format,
    );
  }

  return (
    <main className="page sales-page">
      <div className="page-head">
        <div>
          <h1>Items sold</h1>
          <p className="subhead">
            How many of each dish went out
            {from === to ? ` on ${from}` : ` from ${from} to ${to}`}.
          </p>
        </div>
        <div className="head-tools">
          <div className="range-row">
            <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <button
              type="button"
              className="range-today"
              disabled={from === today && to === today}
              onClick={() => {
                const day = todayISO();
                setFrom(day);
                setTo(day);
              }}
            >
              Today
            </button>
          </div>
          <ExportButtons disabled={rows.length === 0} onExport={exportItems} />
        </div>
      </div>

      <section className="data-panel">
        <div className="filter-bar">
          <label className="filter-search">
            <span>Search dishes</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Name or category"
            />
          </label>
          <p className="filter-count">
            {rows.length} items · {totalQty} sold · {rupees(totalAmount)}
          </p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Qty sold</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No paid items in this range yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.id}:${row.name}`}>
                    <td>{row.name}</td>
                    <td>{row.category}</td>
                    <td>{row.qty}</td>
                    <td>{rupees(row.amount)}</td>
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
