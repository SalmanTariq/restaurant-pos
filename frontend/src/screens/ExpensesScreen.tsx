import { FormEvent, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, defaultReportRange, inDateTimeRange, rupees, todayISO } from "../demo-data";
import { usePos } from "../pos-store";
import {
  downloadReport,
  fileStamp,
  rangeLabel,
  type ExportFormat,
} from "../export-report";
import { DateRangeFields } from "./DateRangeFields";
import { ExportButtons } from "./ExportButtons";
import type { ExpenseRow } from "../pos-types";
import { restaurantSlug } from "../settings";

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function ExpensesScreen() {
  const today = todayISO();
  const initialRange = defaultReportRange();
  const {
    expenses,
    staff,
    addExpense,
    updateExpense,
    deleteExpense,
    addStaff,
    updateStaff,
    deleteStaff,
    recordWage,
    settings,
    canAmendCatalog,
  } = usePos();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [fromTime, setFromTime] = useState(initialRange.fromTime);
  const [toTime, setToTime] = useState(initialRange.toTime);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editWage, setEditWage] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses.filter((row) => {
      if (!inDateTimeRange(row.date, undefined, from, fromTime, to, toTime)) return false;
      if (category !== "all" && row.category !== category) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle) ||
        row.notes.toLowerCase().includes(needle)
      );
    });
  }, [expenses, query, category, from, fromTime, to, toTime]);

  const rangeTotal = visible.reduce((sum, row) => sum + row.amount, 0);
  const wageTotal = visible
    .filter((row) => row.staffId)
    .reduce((sum, row) => sum + row.amount, 0);

  function exportExpenses(format: ExportFormat) {
    downloadReport(
      {
        basename: `${restaurantSlug(settings.restaurantName)}-expenses-${fileStamp(from, to, fromTime, toTime)}`,
        title: `${settings.restaurantName} - Expenses`,
        subtitle: `${rangeLabel(from, to, fromTime, toTime)} · ${visible.length} expenses · ${rupees(rangeTotal)}`,
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

  function clearExpenseForm() {
    setTitle("");
    setAmount("");
    setNotes("");
    setDate(todayISO());
    setNewCategory(EXPENSE_CATEGORIES[1]);
    setEditingExpenseId(null);
  }

  function startEditExpense(row: ExpenseRow) {
    setEditingExpenseId(row.id);
    setTitle(row.title);
    setAmount(String(row.amount));
    setNotes(row.notes);
    setDate(row.date);
    setNewCategory(row.category);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
    const patch = {
      title: title.trim(),
      category: newCategory,
      amount: value,
      date,
      notes: notes.trim(),
    };
    if (editingExpenseId) {
      updateExpense(editingExpenseId, patch);
    } else {
      addExpense(patch);
    }
    clearExpenseForm();
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
              disabled={!canAmendCatalog}
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
              disabled={!canAmendCatalog}
            />
            <button className="btn-ink" type="submit" disabled={!canAmendCatalog}>
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
                const editing = editingId === member.id;
                return (
                  <li key={member.id}>
                    {editing ? (
                      <form
                        className="wage-edit"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = Number(editWage);
                          if (!editName.trim() || !Number.isFinite(value) || value <= 0) {
                            return;
                          }
                          updateStaff(member.id, {
                            name: editName,
                            dailyWage: value,
                          });
                          setEditingId(null);
                          setWageNote(`Updated ${editName.trim()}`);
                        }}
                      >
                        <input
                          type="text"
                          aria-label={`Name for ${member.name}`}
                          value={editName}
                          onChange={(event) => setEditName(event.currentTarget.value)}
                          required
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`Daily wage for ${member.name}`}
                          value={editWage}
                          onChange={(event) => setEditWage(event.currentTarget.value)}
                          required
                        />
                        <button type="submit" className="text-btn">
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="wage-person">
                          <strong>{member.name}</strong>
                          <span>{rupees(member.dailyWage)} / day</span>
                        </div>
                        <div className="wage-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Edit ${member.name}`}
                            disabled={!canAmendCatalog}
                            onClick={() => {
                              setEditingId(member.id);
                              setEditName(member.name);
                              setEditWage(String(member.dailyWage));
                            }}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Delete ${member.name}`}
                            disabled={!canAmendCatalog}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete worker “${member.name}”?`,
                                )
                              ) {
                                deleteStaff(member.id);
                                if (editingId === member.id) setEditingId(null);
                                setWageNote(`Removed ${member.name}`);
                              }
                            }}
                          >
                            <TrashIcon />
                          </button>
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
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {wageNote ? <p className="subhead">{wageNote}</p> : null}
        </section>

        <form className="login-card users-form" onSubmit={onSubmit}>
          <h2>{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
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
            {(EXPENSE_CATEGORIES.includes(newCategory)
              ? EXPENSE_CATEGORIES
              : [newCategory, ...EXPENSE_CATEGORIES]
            ).map((name) => (
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
          <div className="wage-actions">
            <button className="btn-tandoor" type="submit">
              {editingExpenseId ? "Update expense" : "Save expense"}
            </button>
            {editingExpenseId ? (
              <button
                className="text-btn"
                type="button"
                onClick={clearExpenseForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <section className="data-panel">
          <div className="filter-bar filter-bar-dates">
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">
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
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Edit ${row.title}`}
                          onClick={() => startEditExpense(row)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Delete ${row.title}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete expense “${row.title}”?`,
                              )
                            ) {
                              deleteExpense(row.id);
                              if (editingExpenseId === row.id) {
                                clearExpenseForm();
                              }
                            }
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </td>
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
