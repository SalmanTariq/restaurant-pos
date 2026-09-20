import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { rupees, stockLabel, stockTone } from "../demo-data";
import { usePos } from "../pos-store";
import type { MenuItem } from "../pos-types";
import { isLogoDataUrl, openDishPhotoFile } from "../settings";
import { DishPhotoCrop } from "./DishPhotoCrop";

const emptyForm = (category: string) => ({
  id: "",
  name: "",
  category,
  price: "",
  remaining: "0",
  active: true,
  imageDataUrl: null as string | null,
});

type ItemForm = ReturnType<typeof emptyForm>;

function newMenuItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `item-${crypto.randomUUID()}`;
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  const { menu, available, deleteMenuItem, onTickets, categories, settings } =
    usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editingId, setEditingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);

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

  const askDelete = useCallback((item: MenuItem) => {
    setPendingDelete(item);
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
            {settings.useInventory
              ? "Record what the kitchen cooked. Drag a dish to set its place on Order."
              : "Add and edit dishes. Drag a dish to set its place on Order."}
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
            {categories.map((name) => (
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
        onAskDelete={askDelete}
      />
      <CookBoard
        rows={rows}
        editingId={editingId}
        onEdit={onEdit}
        onAskDelete={askDelete}
        showStock={settings.useInventory}
        canDrag={!query.trim()}
      />
      {pendingDelete ? (
        <DeleteDishDialog
          item={pendingDelete}
          held={onTickets(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteMenuItem(pendingDelete.id);
            if (editingId === pendingDelete.id) setEditingId("");
            setPendingDelete(null);
          }}
        />
      ) : null}
    </main>
  );
}

const CookBoard = memo(function CookBoard({
  rows,
  editingId,
  onEdit,
  onAskDelete,
  showStock,
  canDrag,
}: {
  rows: MenuItem[];
  editingId: string;
  onEdit: (item: MenuItem) => void;
  onAskDelete: (item: MenuItem) => void;
  showStock: boolean;
  canDrag: boolean;
}) {
  const { available, onTickets, addCooked, moveMenuItem } = usePos();
  const [cookQty, setCookQty] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const moved = useRef(false);

  function qtyFor(id: string) {
    return cookQty[id] ?? "10";
  }

  function cook(itemId: string) {
    const qty = Number(qtyFor(itemId));
    if (!Number.isFinite(qty) || qty <= 0) return;
    addCooked(itemId, qty);
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (!canDrag || event.button !== 0) return;
    event.preventDefault();
    moved.current = false;
    dragIdRef.current = id;
    setDragId(id);
    setOverId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragIdRef.current) return;
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2) {
      moved.current = true;
    }
    const node = document.elementFromPoint(event.clientX, event.clientY);
    const card = node?.closest("[data-menu-id]") as HTMLElement | null;
    const next = card?.dataset.menuId ?? null;
    if (next) setOverId(next);
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragIdRef.current) return;
    const from = dragIdRef.current;
    const node = document.elementFromPoint(event.clientX, event.clientY);
    const card = node?.closest("[data-menu-id]") as HTMLElement | null;
    const to = card?.dataset.menuId ?? overId;
    dragIdRef.current = null;
    setDragId(null);
    setOverId(null);
    window.setTimeout(() => {
      moved.current = false;
    }, 0);
    if (to && from !== to) moveMenuItem(from, to);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  }

  return (
    <ul className={dragId ? "cook-board is-sorting" : "cook-board"}>
      {rows.map((item) => {
        const left = available(item.id);
        const held = onTickets(item.id);
        const tone = stockTone(left);
        const classes = [
          "cook-card",
          editingId === item.id ? "is-editing" : "",
          canDrag ? "is-sortable" : "",
          dragId === item.id ? "is-dragging" : "",
          overId === item.id && dragId && dragId !== item.id ? "is-drop" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li
            key={item.id}
            data-menu-id={item.id}
            className={classes}
            onClickCapture={(event) => {
              if (!moved.current) return;
              if ((event.target as HTMLElement | null)?.closest("button")) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="cook-head">
              {canDrag ? (
                <button
                  type="button"
                  className="cook-grip"
                  aria-label={`Move ${item.name} on the order screen`}
                  title="Drag to reorder"
                  onPointerDown={(event) => onCardPointerDown(event, item.id)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={onCardPointerUp}
                  onPointerCancel={onCardPointerUp}
                >
                  <GripIcon />
                </button>
              ) : null}
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
                <em className="cook-price">{rupees(item.price)}</em>
              </p>
              <div className="cook-actions">
                <button
                  type="button"
                  className="cook-icon"
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                  onClick={() => onEdit(item)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="cook-icon is-danger"
                  aria-label={`Delete ${item.name}`}
                  title="Delete"
                  onClick={() => onAskDelete(item)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            {showStock ? (
              <>
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
              </>
            ) : null}
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
  onAskDelete,
}: {
  item: MenuItem | null;
  remaining: number;
  onClose: () => void;
  onAskDelete: (item: MenuItem) => void;
}) {
  const { saveMenuItem, onTickets, categories, settings, menu } = usePos();
  const [form, setForm] = useState<ItemForm>(() =>
    item ? formFromItem(item, remaining) : emptyForm(categories[0] ?? "Other"),
  );
  const [photoError, setPhotoError] = useState("");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const editing = Boolean(form.id);

  function closeCrop() {
    setCropSrc((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
  }

  function patch<K extends keyof ItemForm>(key: K, value: ItemForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const price = Number(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return;
    const nextRemaining = Number(form.remaining);
    if (
      settings.useInventory &&
      (!Number.isFinite(nextRemaining) || nextRemaining < 0)
    ) {
      return;
    }
    const held = form.id ? onTickets(form.id) : 0;
    const current = menu.find((entry) => entry.id === form.id);

    saveMenuItem({
      id: form.id || newMenuItemId(),
      name: form.name.trim(),
      category: form.category,
      price,
      stock: settings.useInventory
        ? Math.floor(nextRemaining) + held
        : (current?.stock ?? 0),
      active: form.active,
      imageDataUrl: form.imageDataUrl,
    });
    setForm(emptyForm(categories[0] ?? "Other"));
    onClose();
  }

  return (
    <div id="inv-editor" className="login-card users-form">
      <h2>{editing ? "Edit item" : "Add item"}</h2>
      <p className="subhead">
        {editing
          ? settings.useInventory
            ? "Change name, price, remaining stock, or hide the item from the order screen."
            : "Change name, price, photo, or hide the item from the order screen."
          : settings.useInventory
            ? "New items start at the remaining stock you enter. Add cooked later for new batches."
            : "New items appear on Order once you save them."}
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
        {Array.from(
          new Set(
            form.category ? [form.category, ...categories] : categories,
          ),
        ).map((name) => (
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
      {settings.useInventory ? (
        <>
          <label htmlFor="inv-remaining">Remaining stock</label>
          <input
            id="inv-remaining"
            type="number"
            min="0"
            step="1"
            value={form.remaining}
            onChange={(event) => patch("remaining", inputValue(event))}
          />
        </>
      ) : null}
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
          <span className="logo-preview is-empty dish-preview" aria-hidden="true">
            +
          </span>
        )}
        <div className="logo-actions">
          <label className="cook-edit logo-file">
            {form.imageDataUrl ? "Replace photo" : "Add photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-labelledby="inv-photo-label"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setPhotoError("");
                void openDishPhotoFile(file)
                  .then((src) => setCropSrc(src))
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
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setCropSrc(form.imageDataUrl)}
              >
                Adjust crop
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => patch("imageDataUrl", null)}
              >
                Remove photo
              </button>
            </>
          ) : null}
          <p className="subhead dish-photo-hint">
            Crop every photo to a square so dishes line up on the Orders screen.
          </p>
        </div>
      </div>
      {photoError ? (
        <p className="auth-error" role="alert">
          {photoError}
        </p>
      ) : null}
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
        <>
          <button
            type="button"
            className="ghost-btn modal-cancel"
            onClick={() => {
              setForm(emptyForm(categories[0] ?? "Other"));
              onClose();
            }}
          >
            Cancel edit
          </button>
          {item ? (
            <button
              type="button"
              className="btn-danger"
              onClick={() => onAskDelete(item)}
            >
              Delete from menu
            </button>
          ) : null}
        </>
      ) : null}
      {cropSrc ? (
        <DishPhotoCrop
          src={cropSrc}
          onCancel={closeCrop}
          onApply={(imageDataUrl) => {
            setForm((current) => ({ ...current, imageDataUrl }));
            closeCrop();
          }}
        />
      ) : null}
    </div>
  );
}

function GripIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
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

function DeleteDishDialog({
  item,
  held,
  onCancel,
  onConfirm,
}: {
  item: MenuItem;
  held: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dish-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-dish-title">Delete this dish?</h2>
        <p className="subhead">
          {item.name} will leave the menu and inventory.{" "}
          {held
            ? `Open tickets keep ${held} already sent.`
            : "This does not change past sales."}
        </p>
        <button className="btn-danger" type="button" onClick={onConfirm}>
          Delete {item.name}
        </button>
        <button className="ghost-btn modal-cancel" type="button" onClick={onCancel}>
          Keep it
        </button>
      </div>
    </div>
  );
}
