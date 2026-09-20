import type { MenuItem } from "./pos-types";

export const INVENTORY_CSV_HEADERS = [
  "id",
  "name",
  "name_urdu",
  "category",
  "price",
  "stock",
  "active",
] as const;

function csvEscape(value: string | number | boolean) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseCsvRecords(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readActive(value: string, fallback: boolean) {
  const text = value.trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "y", "active"].includes(text)) return true;
  if (["0", "false", "no", "n", "hidden", "inactive"].includes(text)) return false;
  return fallback;
}

function newItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `item-${crypto.randomUUID()}`;
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function inventoryToCsv(menu: MenuItem[]) {
  const lines = [
    INVENTORY_CSV_HEADERS.join(","),
    ...menu.map((item) =>
      [
        item.id,
        item.name,
        item.nameUrdu ?? "",
        item.category,
        item.price,
        item.stock,
        item.active ? "true" : "false",
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadInventoryCsv(menu: MenuItem[], basename: string) {
  const blob = new Blob([inventoryToCsv(menu)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${basename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mergeInventoryCsv(
  current: MenuItem[],
  text: string,
): { menu: MenuItem[]; added: number; updated: number; error?: string } {
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    return { menu: current, added: 0, updated: 0, error: "CSV needs a header row and at least one dish." };
  }
  const header = records[0].map(headerKey);
  const col = (aliases: string[]) =>
    header.findIndex((name) => aliases.includes(name));
  const nameIdx = col(["name", "item", "dish", "english", "english_name"]);
  if (nameIdx < 0) {
    return {
      menu: current,
      added: 0,
      updated: 0,
      error: "CSV needs a Name column.",
    };
  }
  const idIdx = col(["id", "item_id", "client_id"]);
  const urduIdx = col(["name_urdu", "urdu", "urdu_name", "nameurdu"]);
  const categoryIdx = col(["category", "cat"]);
  const priceIdx = col(["price", "sale_price", "saleprice"]);
  const stockIdx = col(["stock", "qty", "quantity", "remaining"]);
  const activeIdx = col(["active", "is_active", "visible"]);

  const next = current.map((item) => ({ ...item }));
  let added = 0;
  let updated = 0;

  for (const record of records.slice(1)) {
    const name = (record[nameIdx] ?? "").trim();
    if (!name) continue;
    const id = (idIdx >= 0 ? record[idIdx] : "").trim();
    const nameUrdu = (urduIdx >= 0 ? record[urduIdx] : "").trim();
    const category = (categoryIdx >= 0 ? record[categoryIdx] : "").trim();
    const priceRaw = priceIdx >= 0 ? record[priceIdx] : "";
    const stockRaw = stockIdx >= 0 ? record[stockIdx] : "";
    const price = Number(priceRaw);
    const stock = Number(stockRaw);
    const byId = id ? next.findIndex((item) => item.id === id) : -1;
    const byName = next.findIndex(
      (item) => item.name.trim().toLowerCase() === name.toLowerCase(),
    );
    const index = byId >= 0 ? byId : byName;
    if (index >= 0) {
      const prev = next[index];
      next[index] = {
        ...prev,
        name,
        nameUrdu: nameUrdu || prev.nameUrdu || "",
        category: category || prev.category,
        price: Number.isFinite(price) && price >= 0 ? price : prev.price,
        stock:
          Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : prev.stock,
        active: activeIdx >= 0 ? readActive(record[activeIdx] ?? "", prev.active) : prev.active,
      };
      updated += 1;
    } else {
      if (!Number.isFinite(price) || price < 0) {
        return {
          menu: current,
          added: 0,
          updated: 0,
          error: `Price is required for new dish “${name}”.`,
        };
      }
      next.push({
        id: id || newItemId(),
        name,
        nameUrdu,
        category: category || "Other",
        price,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
        active: activeIdx >= 0 ? readActive(record[activeIdx] ?? "", true) : true,
        imageDataUrl: null,
      });
      added += 1;
    }
  }

  if (added === 0 && updated === 0) {
    return {
      menu: current,
      added: 0,
      updated: 0,
      error: "No dishes found in that CSV.",
    };
  }

  return { menu: next, added, updated };
}
