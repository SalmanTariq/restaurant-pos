import type { MenuItem } from "./pos-types";
import { isLogoDataUrl } from "./settings";
import { unzipStore, zipStore } from "./zip-store";

export const INVENTORY_CSV_HEADERS = [
  "id",
  "name",
  "name_urdu",
  "category",
  "price",
  "stock",
  "active",
  "photo",
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

function safePhotoId(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-") || "item";
}

function parseDataUrl(url: string) {
  const match = url.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([\s\S]+)$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const ext = kind === "jpeg" || kind === "jpg" ? "jpg" : kind;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { ext, bytes, mime: kind === "jpg" ? "jpeg" : kind };
  } catch {
    return null;
  }
}

export function inventoryPhotoPath(item: MenuItem) {
  if (!isLogoDataUrl(item.imageDataUrl)) return "";
  const parsed = parseDataUrl(item.imageDataUrl);
  if (!parsed) return "";
  return `photos/${safePhotoId(item.id)}.${parsed.ext}`;
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
        inventoryPhotoPath(item),
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadInventoryCsv(menu: MenuItem[], basename: string) {
  triggerDownload(
    new Blob([inventoryToCsv(menu)], { type: "text/csv;charset=utf-8" }),
    `${basename}.csv`,
  );
}

export function buildInventoryZip(menu: MenuItem[]) {
  const files = [
    { name: "menu.csv", data: new TextEncoder().encode(inventoryToCsv(menu)) },
  ];
  for (const item of menu) {
    if (!isLogoDataUrl(item.imageDataUrl)) continue;
    const parsed = parseDataUrl(item.imageDataUrl);
    const path = inventoryPhotoPath(item);
    if (!parsed || !path) continue;
    files.push({ name: path, data: parsed.bytes });
  }
  return zipStore(files);
}

export function downloadInventoryArchive(menu: MenuItem[], basename: string) {
  triggerDownload(
    new Blob([buildInventoryZip(menu)], { type: "application/zip" }),
    `${basename}.zip`,
  );
}

function bytesToDataUrl(bytes: Uint8Array, name: string) {
  const lower = name.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : lower.endsWith(".gif")
        ? "image/gif"
        : "image/jpeg";
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

function photoLookupKey(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

export async function readInventoryImport(file: File): Promise<{
  csv: string;
  photos: Record<string, string>;
}> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".zip") && file.type !== "application/zip") {
    return { csv: await file.text(), photos: {} };
  }
  const files = unzipStore(new Uint8Array(await file.arrayBuffer()));
  const csvFile =
    files.find((entry) => entry.name.replace(/\\/g, "/").toLowerCase().endsWith("menu.csv")) ??
    files.find((entry) => entry.name.toLowerCase().endsWith(".csv"));
  if (!csvFile) {
    throw new Error("That zip needs a menu.csv file.");
  }
  const photos: Record<string, string> = {};
  for (const entry of files) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
    const dataUrl = bytesToDataUrl(entry.data.slice(), entry.name);
    const path = photoLookupKey(entry.name);
    photos[path] = dataUrl;
    const base = path.split("/").pop();
    if (base) photos[base] = dataUrl;
  }
  return { csv: new TextDecoder().decode(csvFile.data), photos };
}

export function mergeInventoryCsv(
  current: MenuItem[],
  text: string,
  photos: Record<string, string> = {},
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
  const photoIdx = col([
    "photo",
    "image",
    "image_data_url",
    "imagedataurl",
    "picture",
  ]);

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
    const photoRaw = (photoIdx >= 0 ? record[photoIdx] : "").trim();
    const fromFile = photos[photoLookupKey(photoRaw)] ?? photos[photoLookupKey(photoRaw.split(/[/\\]/).pop() ?? "")];
    const photo = isLogoDataUrl(photoRaw)
      ? photoRaw
      : isLogoDataUrl(fromFile)
        ? fromFile
        : null;
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
        imageDataUrl: photo ?? prev.imageDataUrl ?? null,
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
        imageDataUrl: photo,
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
