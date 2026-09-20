import { FormEvent, useMemo, useState } from "react";
import { usePos } from "../pos-store";

export function CategoriesScreen() {
  const { menu, categories, addCategory, renameCategory, deleteCategory } =
    usePos();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of menu) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [menu]);

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const result = addCategory(name);
    if (result) {
      setError(result);
      return;
    }
    setName("");
    setError("");
  }

  function startEdit(current: string) {
    setEditing(current);
    setDraft(current);
    setError("");
  }

  function saveEdit() {
    if (!editing) return;
    const result = renameCategory(editing, draft);
    if (result) {
      setError(result);
      return;
    }
    setEditing(null);
    setError("");
  }

  function askDelete(current: string) {
    const others = categories.filter((entry) => entry !== current);
    setPending(current);
    setMoveTo(others[0] ?? "");
    setError("");
  }

  function confirmDelete() {
    if (!pending) return;
    const result = deleteCategory(pending, moveTo);
    if (result) {
      setError(result);
      return;
    }
    setPending(null);
    if (editing === pending) setEditing(null);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Categories</h1>
          <p className="subhead">
            Names cashiers tap on Order. New dishes pick from this list.
          </p>
        </div>
      </div>

      <div className="users-layout">
        <form className="login-card users-form" onSubmit={onAdd}>
          <h2>Add category</h2>
          <label htmlFor="cat-name">Name</label>
          <input
            id="cat-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            autoComplete="off"
            placeholder="Karahi"
            required
          />
          {error && !pending ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn-tandoor" type="submit">
            Add category
          </button>
        </form>

        <section className="top-items staff-table cat-table">
          <header>
            <h2>Menu groups</h2>
            <p>
              <span>Dishes</span>
              <span>Actions</span>
            </p>
          </header>
          <ul>
            {categories.map((entry) => {
              const count = counts.get(entry) ?? 0;
              const isEdit = editing === entry;
              return (
                <li key={entry}>
                  {isEdit ? (
                    <label className="cat-inline">
                      <span className="sr-only">Rename {entry}</span>
                      <input
                        type="text"
                        value={draft}
                        autoComplete="off"
                        onChange={(event) => setDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveEdit();
                          }
                          if (event.key === "Escape") setEditing(null);
                        }}
                      />
                    </label>
                  ) : (
                    <span className="cat-name">{entry}</span>
                  )}
                  <span className="sold">
                    {count} {count === 1 ? "dish" : "dishes"}
                  </span>
                  <div className="cook-actions">
                    {isEdit ? (
                      <>
                        <button
                          type="button"
                          className="cook-icon"
                          aria-label={`Save ${entry}`}
                          title="Save"
                          onClick={saveEdit}
                        >
                          <CheckIcon />
                        </button>
                        <button
                          type="button"
                          className="cook-icon"
                          aria-label="Cancel rename"
                          title="Cancel"
                          onClick={() => setEditing(null)}
                        >
                          <CloseIcon />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="cook-icon"
                          aria-label={`Edit ${entry}`}
                          title="Edit"
                          onClick={() => startEdit(entry)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="cook-icon is-danger"
                          aria-label={`Delete ${entry}`}
                          title="Delete"
                          disabled={categories.length < 2}
                          onClick={() => askDelete(entry)}
                        >
                          <TrashIcon />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {pending ? (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cat-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-cat-title">Delete {pending}?</h2>
            <p className="subhead">
              {(counts.get(pending) ?? 0) > 0
                ? "Dishes in this group move to another category."
                : "No dishes use this name yet."}
            </p>
            {(counts.get(pending) ?? 0) > 0 ? (
              <label htmlFor="cat-move">
                Move dishes to
                <select
                  id="cat-move"
                  value={moveTo}
                  onChange={(event) => setMoveTo(event.currentTarget.value)}
                >
                  {categories
                    .filter((entry) => entry !== pending)
                    .map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {error && pending ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn-danger" type="button" onClick={confirmDelete}>
              Delete category
            </button>
            <button
              className="ghost-btn modal-cancel"
              type="button"
              onClick={() => setPending(null)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PencilIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
