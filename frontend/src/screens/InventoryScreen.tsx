import { FormEvent, useMemo, useState } from "react";
import { CATEGORIES, rupees } from "../demo-data";
import { usePos } from "../pos-store";
import type { MenuItem } from "../pos-types";

const emptyForm = {
  id: "",
  name: "",
  category: CATEGORIES[0],
  price: "",
  stock: "",
  active: true,
};

export function InventoryScreen() {
  const { menu, saveMenuItem } = usePos();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [form, setForm] = useState(emptyForm);
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
      stock: String(item.stock),
      active: item.active,
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(stock) || stock < 0) return;

    saveMenuItem({
      id: form.id || `item-${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      price,
      stock,
      active: form.active,
    });
    setForm(emptyForm);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="subhead">Stock on hand and selling prices for the counter.</p>
        </div>
      </div>

      <div className="users-layout">
        <form className="login-card users-form" onSubmit={onSubmit}>
          <h2>{editing ? "Edit item" : "Add item"}</h2>
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
          <label htmlFor="inv-stock">Stock</label>
          <input
            id="inv-stock"
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(event) =>
              setForm((current) => ({ ...current, stock: event.currentTarget.value }))
            }
            required
          />
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

        <section className="data-panel">
          <div className="filter-bar">
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
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        type="button"
                        className="text-btn table-link"
                        onClick={() => load(item)}
                      >
                        {item.name}
                      </button>
                    </td>
                    <td>{item.category}</td>
                    <td className="num">{item.stock}</td>
                    <td className="num">{rupees(item.price)}</td>
                    <td>{item.active ? "Active" : "Hidden"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
