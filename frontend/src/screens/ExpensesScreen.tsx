import { FormEvent, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, inDateRange, rupees, todayISO } from "../demo-data";
import { usePos } from "../pos-store";
import {
  downloadReport,
  fileStamp,
  rangeLabel,
  type ExportFormat,
} from "../export-report";
import { DateRangeFields } from "./DateRangeFields";
import { ExportButtons } from "./ExportButtons";

export function ExpensesScreen() {
  const today = todayISO();
  const { expenses, staff, addExpense, addStaff, recordWage } = usePos();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [newCategory, setNewCategory] = useState(EXPENSE_CATEGORIES[1]);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today);
  const [workerName, setWorkerName] = useState("");
  const [dailyWage, setDailyWage] = useState("");
  const [wageDate, setWageDate] = useState(today);
  const [wageNote, setWageNote] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses.filter((row) => {
      if (!inDateRange(row.date, from, to)) return false;
      if (category !== "all" && row.category !== category) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle) ||
        row.notes.toLowerCase().includes(needle)
      );
    });
  }, [expenses, query, category, from, to]);

  const rangeTotal = visible.reduce((sum, row) => sum + row.amount, 0);
  const wageTotal = visible
    .filter((row) => row.staffId)
    .reduce((sum, row) => sum + row.amount, 0);

  function exportExpenses(format: ExportFormat) {
    downloadReport(
      {
        basename: `delhi-malik-nihari-expenses-${fileStamp(from, to)}`,
        title: "Delhi Malik Nihari - Expenses",
        subtitle: `${rangeLabel(from, to)} · ${visible.length} expenses · ${rupees(rangeTotal)}`,
        headers: ["Title", "Category", "Date", "Notes", "Amount"],
        rows: visible.map((row) => [
          row.title,
          row.category,
          row.date,
          row.notes,
          row.amount,
        ]),
        totalLabel: "Total",
        totalValue: rangeTotal,
      },
      format,
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
    addExpense({
      title: title.trim(),
      category: newCategory,
      amount: value,
      date,
      notes: notes.trim(),
    });
    setTitle("");
    setAmount("");
    setNotes("");
    setDate(todayISO());
  }

  function onAddStaff(event: FormEvent) {
    event.preventDefault();
    addStaff(workerName, Number(dailyWage));
    setWorkerName("");
    setDailyWage("");
  }

  return (
    <main className="page expenses-page">
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <p className="subhead">Daily wages, grocery, gas, and other till outflows.</p>
        </div>
        <div className="head-tools">
          <ExportButtons disabled={visible.length === 0} onExport={exportExpenses} />
          <div className="dash-kpis">
            <p>
              Wages in range
              <strong>{rupees(wageTotal)}</strong>
            </p>
            <p>
              In range
              <strong>{rupees(rangeTotal)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="users-layout expenses-layout">
        <section className="login-card users-form">
          <h2>Daily wages</h2>
          <p className="subhead">Record each worker’s wage for the day.</p>
          <form onSubmit={onAddStaff}>
            <label htmlFor="wage-name">Worker</label>
            <input
              id="wage-name"
              type="text"
              value={workerName}
              onChange={(event) => setWorkerName(event.currentTarget.value)}
              placeholder="Name"
              required
            />
            <label htmlFor="wage-amount">Daily wage (Rs)</label>
            <input
              id="wage-amount"
              type="number"
              min="1"
              step="1"
              value={dailyWage}
              onChange={(event) => setDailyWage(event.currentTarget.value)}
              required
            />
            <button className="btn-ink" type="submit">
              Add worker
            </button>
          </form>
          <label htmlFor="wage-date">Wage date</label>
          <input
            id="wage-date"
            type="date"
            value={wageDate}
            onChange={(event) => setWageDate(event.currentTarget.value)}
          />
          {staff.length === 0 ? (
            <p className="subhead">Add kitchen and floor staff to log daily wages.</p>
          ) : (
            <ul className="wage-list">
              {staff.map((member) => {
                const paid = expenses.some(
                  (row) => row.staffId === member.id && row.date === wageDate,
                );
                return (
                  <li key={member.id}>
                    <div>
                      <strong>{member.name}</strong>
                      <span>{rupees(member.dailyWage)} / day</span>
                    </div>
                    <button
                      type="button"
                      className="btn-tandoor"
                      disabled={paid}
                      onClick={() => {
                        const ok = recordWage(member.id, wageDate);
                        setWageNote(
                          ok
                            ? `Recorded ${member.name}`
                            : `${member.name} already paid for ${wageDate}`,
                        );
                      }}
                    >
                      {paid ? "Paid" : "Record wage"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {wageNote ? <p className="subhead">{wageNote}</p> : null}
        </section>

        <form className="login-card users-form" onSubmit={onSubmit}>
          <h2>Add expense</h2>
          <label htmlFor="exp-title">Title</label>
          <input
            id="exp-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />
          <label htmlFor="exp-category">Category</label>
          <select
            id="exp-category"
            value={newCategory}
            onChange={(event) => setNewCategory(event.currentTarget.value)}
          >
            {EXPENSE_CATEGORIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label htmlFor="exp-amount">Amount (Rs)</label>
          <input
            id="exp-amount"
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.currentTarget.value)}
            required
          />
          <label htmlFor="exp-date">Date</label>
          <input
            id="exp-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
            required
          />
          <label htmlFor="exp-notes">Notes</label>
          <input
            id="exp-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <button className="btn-tandoor" type="submit">
            Save expense
          </button>
        </form>

        <section className="data-panel">
          <div className="filter-bar filter-bar-dates">
            <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <label className="filter-search">
              <span>Search expenses</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Title, notes…"
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
              >
                <option value="all">All</option>
                {EXPENSE_CATEGORIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p className="filter-count">
              {visible.length} shown · {rupees(rangeTotal)}
            </p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Notes</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No expenses match these filters.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.category}</td>
                      <td>{row.date}</td>
                      <td>{row.notes || "—"}</td>
                      <td className="num">{rupees(row.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
