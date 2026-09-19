import { FormEvent, useMemo, useState } from "react";
import { CATEGORIES, stockLabel, stockTone } from "../demo-data";
import { usePos } from "../pos-store";
import type { MenuItem } from "../pos-types";
import { isLogoDataUrl, readDishPhotoFile } from "../settings";

const emptyForm = {
  id: "",
  name: "",
  category: CATEGORIES[0],
  price: "",
  remaining: "0",
  active: true,
  imageDataUrl: null as string | null,
};

export function InventoryScreen() {
  const { menu, saveMenuItem, available, onTickets, addCooked } = usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [form, setForm] = useState(emptyForm);
  const [photoError, setPhotoError] = useState("");
  const [cookQty, setCookQty] = useState<Record<string, string>>({});
  const editing = Boolean(form.id);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [menu, query, category]);

  function load(item: MenuItem) {
    setForm({
      id: item.id,
      name: item.name,
      category: item.category,
      price: String(item.price),
      remaining: String(available(item.id)),
      active: item.active,
      imageDataUrl: isLogoDataUrl(item.imageDataUrl) ? item.imageDataUrl : null,
    });
    requestAnimationFrame(() => {
      document.getElementById("inv-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function qtyFor(id: string) {
    return cookQty[id] ?? "10";
  }

  function cook(itemId: string) {
    const qty = Number(qtyFor(itemId));
    if (!Number.isFinite(qty) || qty <= 0) return;
    addCooked(itemId, qty);
    if (form.id === itemId) {
      setForm((current) => ({
        ...current,
        remaining: String(available(itemId) + Math.floor(qty)),
      }));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const price = Number(form.price);
    const remaining = Number(form.remaining);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(remaining) || remaining < 0) return;
    const held = form.id ? onTickets(form.id) : 0;

    saveMenuItem({
      id: form.id || `item-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      price,
      stock: Math.floor(remaining) + held,
      active: form.active,
      imageDataUrl: form.imageDataUrl,
    });
    setForm(emptyForm);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="subhead">
            Record what the kitchen cooked. Open and paid orders come off remaining
            stock.
          </p>
        </div>
      </div>

      <div className="filter-bar cook-filter">
        <label className="filter-search">
          <span>Search items</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Name or category"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
          >
            <option value="all">All</option>
            {CATEGORIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="filter-count">{rows.length} items</p>
      </div>

      <ul className="cook-board">
        {rows.map((item) => {
          const left = available(item.id);
          const held = onTickets(item.id);
          const tone = stockTone(left);
          return (
            <li
              key={item.id}
              className={form.id === item.id ? "cook-card is-editing" : "cook-card"}
            >
              <div className="cook-head">
                {item.imageDataUrl ? (
                  <img
                    className="cook-thumb"
                    src={item.imageDataUrl}
                    alt=""
                  />
                ) : (
                  <span className="cook-thumb is-empty" aria-hidden="true">
                    {item.name.slice(0, 1)}
                  </span>
                )}
                <p className="cook-name">
                  <strong>{item.name}</strong>
                  <span>
                    {item.category}
                    {item.active ? "" : " · hidden"}
                  </span>
                </p>
                <button
                  type="button"
                  className="cook-edit"
                  onClick={() => load(item)}
                >
                  Edit
                </button>
              </div>
              <p className={tone ? `cook-left ${tone}` : "cook-left"}>
                <strong>{left}</strong>
                <span>
                  {stockLabel(left)}
                  {held ? ` · ${held} on tickets` : ""}
                </span>
              </p>
              <form
                className="cook-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  cook(item.id);
                }}
              >
                <label htmlFor={`cook-${item.id}`}>
                  <span>Cooked</span>
                  <input
                    id={`cook-${item.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={qtyFor(item.id)}
                    onChange={(event) =>
                      setCookQty((current) => ({
                        ...current,
                        [item.id]: event.currentTarget.value,
                      }))
                    }
                  />
                </label>
                <button className="btn-cook" type="submit">
                  Add cooked
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <form id="inv-editor" className="login-card users-form" onSubmit={onSubmit}>
        <h2>{editing ? "Edit item" : "Add item"}</h2>
        <p className="subhead">
          {editing
            ? "Change name, price, remaining stock, or hide the item from the order screen."
            : "New items start at the remaining stock you enter. Add cooked later for new batches."}
        </p>
        <label htmlFor="inv-name">Name</label>
        <input
          id="inv-name"
          type="text"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.currentTarget.value }))
          }
          required
        />
        <label htmlFor="inv-cat">Category</label>
        <select
          id="inv-cat"
          value={form.category}
          onChange={(event) =>
            setForm((current) => ({ ...current, category: event.currentTarget.value }))
          }
        >
          {CATEGORIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <label htmlFor="inv-price">Sale price (Rs)</label>
        <input
          id="inv-price"
          type="number"
          min="0"
          step="1"
          value={form.price}
          onChange={(event) =>
            setForm((current) => ({ ...current, price: event.currentTarget.value }))
          }
          required
        />
        <label htmlFor="inv-remaining">Remaining stock</label>
        <input
          id="inv-remaining"
          type="number"
          min="0"
          step="1"
          value={form.remaining}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              remaining: event.currentTarget.value,
            }))
          }
          required
        />
        <span className="dish-photo-label" id="inv-photo-label">
          Item photo
        </span>
        <div className="logo-row dish-photo-row">
          {form.imageDataUrl ? (
            <img
              className="logo-preview dish-preview"
              src={form.imageDataUrl}
              alt={`${form.name || "Item"} photo`}
            />
          ) : (
            <span className="logo-preview is-empty dish-preview" aria-hidden="true" />
          )}
          <div className="logo-actions">
            <label className="cook-edit logo-file">
              {form.imageDataUrl ? "Replace photo" : "Add photo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  setPhotoError("");
                  void readDishPhotoFile(file)
                    .then((imageDataUrl) => {
                      setForm((current) => ({ ...current, imageDataUrl }));
                    })
                    .catch((error: unknown) => {
                      setPhotoError(
                        error instanceof Error
                          ? error.message
                          : "Could not use that photo.",
                      );
                    });
                }}
              />
            </label>
            {form.imageDataUrl ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() =>
                  setForm((current) => ({ ...current, imageDataUrl: null }))
                }
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
        {photoError ? (
          <p className="auth-error" role="alert">
            {photoError}
          </p>
        ) : null}
        <p className="subhead">
          A clear plate photo helps staff find the dish on the Orders screen.
        </p>
        <label className="check-row" htmlFor="inv-active">
          <input
            id="inv-active"
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                active: event.currentTarget.checked,
              }))
            }
          />
          Active on order screen
        </label>
        <button className="btn-tandoor" type="submit">
          {editing ? "Save changes" : "Add to menu"}
        </button>
        {editing && (
          <button
            type="button"
            className="ghost-btn modal-cancel"
            onClick={() => setForm(emptyForm)}
          >
            Cancel edit
          </button>
        )}
      </form>
    </main>
  );
}
