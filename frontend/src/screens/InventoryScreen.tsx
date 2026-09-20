import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
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

type ItemForm = typeof emptyForm;

function formFromItem(item: MenuItem, remaining: number): ItemForm {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: String(item.price),
    remaining: String(remaining),
    active: item.active,
    imageDataUrl: isLogoDataUrl(item.imageDataUrl) ? item.imageDataUrl : null,
  };
}

function inputValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  return event.target.value;
}

export function InventoryScreen() {
  const { menu, available } = usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editingId, setEditingId] = useState("");

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

  const onEdit = useCallback((item: MenuItem) => {
    setEditingId(item.id);
    requestAnimationFrame(() => {
      document.getElementById("inv-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const editingItem = editingId
    ? (menu.find((item) => item.id === editingId) ?? null)
    : null;

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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or category"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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

      <InventoryEditor
        key={editingId || "new"}
        item={editingItem}
        remaining={editingItem ? available(editingItem.id) : 0}
        onClose={() => setEditingId("")}
      />
      <CookBoard rows={rows} editingId={editingId} onEdit={onEdit} />
    </main>
  );
}

const CookBoard = memo(function CookBoard({
  rows,
  editingId,
  onEdit,
}: {
  rows: MenuItem[];
  editingId: string;
  onEdit: (item: MenuItem) => void;
}) {
  const { available, onTickets, addCooked } = usePos();
  const [cookQty, setCookQty] = useState<Record<string, string>>({});

  function qtyFor(id: string) {
    return cookQty[id] ?? "10";
  }

  function cook(itemId: string) {
    const qty = Number(qtyFor(itemId));
    if (!Number.isFinite(qty) || qty <= 0) return;
    addCooked(itemId, qty);
  }

  return (
    <ul className="cook-board">
      {rows.map((item) => {
        const left = available(item.id);
        const held = onTickets(item.id);
        const tone = stockTone(left);
        return (
          <li
            key={item.id}
            className={editingId === item.id ? "cook-card is-editing" : "cook-card"}
          >
            <div className="cook-head">
              {item.imageDataUrl ? (
                <img className="cook-thumb" src={item.imageDataUrl} alt="" />
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
                onClick={() => onEdit(item)}
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
            <div className="cook-add">
              <label htmlFor={`cook-${item.id}`}>
                <span>Cooked</span>
                <input
                  id={`cook-${item.id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={qtyFor(item.id)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCookQty((current) => ({
                      ...current,
                      [item.id]: value,
                    }));
                  }}
                />
              </label>
              <button
                className="btn-cook"
                type="button"
                onClick={() => cook(item.id)}
              >
                Add cooked
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
});

function InventoryEditor({
  item,
  remaining,
  onClose,
}: {
  item: MenuItem | null;
  remaining: number;
  onClose: () => void;
}) {
  const { saveMenuItem, onTickets } = usePos();
  const [form, setForm] = useState<ItemForm>(() =>
    item ? formFromItem(item, remaining) : { ...emptyForm },
  );
  const [photoError, setPhotoError] = useState("");
  const editing = Boolean(form.id);

  function patch<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const price = Number(form.price);
    const nextRemaining = Number(form.remaining);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(nextRemaining) || nextRemaining < 0) return;
    const held = form.id ? onTickets(form.id) : 0;

    saveMenuItem({
      id: form.id || `item-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      price,
      stock: Math.floor(nextRemaining) + held,
      active: form.active,
      imageDataUrl: form.imageDataUrl,
    });
    setForm({ ...emptyForm });
    onClose();
  }

  return (
    <div id="inv-editor" className="login-card users-form">
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
        autoComplete="off"
        onChange={(event) => patch("name", inputValue(event))}
      />
      <label htmlFor="inv-cat">Category</label>
      <select
        id="inv-cat"
        value={form.category}
        onChange={(event) => patch("category", inputValue(event))}
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
        onChange={(event) => patch("price", inputValue(event))}
      />
      <label htmlFor="inv-remaining">Remaining stock</label>
      <input
        id="inv-remaining"
        type="number"
        min="0"
        step="1"
        value={form.remaining}
        onChange={(event) => patch("remaining", inputValue(event))}
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
                const file = event.target.files?.[0];
                event.target.value = "";
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
              onClick={() => patch("imageDataUrl", null)}
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
          onChange={(event) => patch("active", event.target.checked)}
        />
        Active on order screen
      </label>
      <button className="btn-tandoor" type="button" onClick={save}>
        {editing ? "Save changes" : "Add to menu"}
      </button>
      {editing ? (
        <button
          type="button"
          className="ghost-btn modal-cancel"
          onClick={() => {
            setForm({ ...emptyForm });
            onClose();
          }}
        >
          Cancel edit
        </button>
      ) : null}
    </div>
  );
}
