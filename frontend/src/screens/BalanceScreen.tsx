import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, inDateRange, lineTotal, rupees, todayISO } from "../demo-data";
import { usePos } from "../pos-store";
import {
  downloadReport,
  fileStamp,
  rangeLabel,
  type ExportFormat,
} from "../export-report";
import { DateRangeFields } from "./DateRangeFields";
import { ExportButtons } from "./ExportButtons";

export function BalanceScreen() {
  const today = todayISO();
  const { orders, expenses, days } = usePos();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const paid = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "paid" &&
          order.payment &&
          inDateRange(order.date, from, to),
      ),
    [orders, from, to],
  );
  const spent = useMemo(
    () => expenses.filter((row) => inDateRange(row.date, from, to)),
    [expenses, from, to],
  );

  const cash = paid
    .filter((order) => order.payment === "cash")
    .reduce((sum, order) => sum + lineTotal(order.lines), 0);
  const online = paid
    .filter((order) => order.payment === "online")
    .reduce((sum, order) => sum + lineTotal(order.lines), 0);
  const sales = cash + online;
  const labor = spent
    .filter((row) => row.category === "Labor")
    .reduce((sum, row) => sum + row.amount, 0);
  const byCategory = EXPENSE_CATEGORIES.map((name) => ({
    name,
    amount: spent
      .filter((row) => row.category === name)
      .reduce((sum, row) => sum + row.amount, 0),
  })).filter((row) => row.amount > 0);
  const expenseTotal = spent.reduce((sum, row) => sum + row.amount, 0);
  const pettyCash = days
    .filter((day) => inDateRange(day.date, from, to))
    .reduce((sum, day) => sum + day.pettyCash, 0);
  const cashInTill = pettyCash + cash - expenseTotal;
  const net = sales - expenseTotal;

  const exportRows: (string | number)[][] = [
    ["Opening petty cash", pettyCash],
    ["Cash sales", cash],
    ["Online sales", online],
    ["Total sales", sales],
    ...byCategory.map((row) => [row.name, row.amount] as (string | number)[]),
    ["Total expenses", expenseTotal],
    ["Net", net],
    ["Cash in till", cashInTill],
  ];

  function exportBalance(format: ExportFormat) {
    downloadReport(
      {
        basename: `delhi-malik-nihari-balance-${fileStamp(from, to)}`,
        title: "Delhi Malik Nihari - Balance sheet",
        subtitle: rangeLabel(from, to),
        headers: ["Line", "Amount"],
        rows: exportRows,
        totalLabel: "Net",
        totalValue: net,
      },
      format,
    );
  }

  return (
    <main className="page sales-page">
      <div className="page-head">
        <div>
          <h1>Balance sheet</h1>
          <p className="subhead">
            Paid sales minus expenses for {from === to ? from : `${from} → ${to}`}.
            Petty cash stays in the till count, not in profit.
          </p>
        </div>
        <div className="head-tools">
          <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <ExportButtons onExport={exportBalance} />
          <div className="dash-kpis">
            <p>
              Sales
              <strong>{rupees(sales)}</strong>
            </p>
            <p>
              Cash in till
              <strong>{rupees(cashInTill)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric cash">
          <span>Petty cash</span>
          <strong>{rupees(pettyCash)}</strong>
        </div>
        <div className="metric cash">
          <span>Cash in</span>
          <strong>{rupees(cash)}</strong>
        </div>
        <div className="metric card">
          <span>Online in</span>
          <strong>{rupees(online)}</strong>
        </div>
        <div className="metric paper">
          <span>Labor wages</span>
          <strong>{rupees(labor)}</strong>
        </div>
        <div className="metric paper">
          <span>All expenses</span>
          <strong>{rupees(expenseTotal)}</strong>
        </div>
      </div>

      <section className="data-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opening petty cash</td>
                <td className="num">{rupees(pettyCash)}</td>
              </tr>
              <tr>
                <td>Cash sales</td>
                <td className="num">{rupees(cash)}</td>
              </tr>
              <tr>
                <td>Online sales</td>
                <td className="num">{rupees(online)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Total sales</strong>
                </td>
                <td className="num">
                  <strong>{rupees(sales)}</strong>
                </td>
              </tr>
              {byCategory.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td className="num">{rupees(row.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total expenses</strong>
                </td>
                <td className="num">
                  <strong>{rupees(expenseTotal)}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Net</strong>
                </td>
                <td className="num">
                  <strong>{rupees(net)}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Cash in till</strong>
                </td>
                <td className="num">
                  <strong>{rupees(cashInTill)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
