import type { PosSettings } from "./pos-types";

export const SETTINGS_KEY = "dmn_pos_settings";
export const DEFAULT_RESTAURANT_NAME = "Delhi Malik Nihari";

export const DEFAULT_SETTINGS: PosSettings = {
  restaurantName: DEFAULT_RESTAURANT_NAME,
  logoDataUrl: null,
  requirePettyCash: true,
  useInventory: true,
};

const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export function isLogoDataUrl(value: string | null | undefined): value is string {
  return Boolean(value && LOGO_PATTERN.test(value));
}

export function brandShort(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "POS";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function restaurantSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "pos";
}

function asSettings(value: unknown): PosSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
  const entry = value as Partial<PosSettings>;
  const name =
    typeof entry.restaurantName === "string" && entry.restaurantName.trim()
      ? entry.restaurantName.trim()
      : DEFAULT_RESTAURANT_NAME;
  const logo = entry.logoDataUrl ?? null;
  return {
    restaurantName: name,
    logoDataUrl: isLogoDataUrl(logo) ? logo : null,
    requirePettyCash: entry.requirePettyCash !== false,
    useInventory: entry.useInventory !== false,
  };
}

export function loadSettings(): PosSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return asSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a PNG or JPG image."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Logo must be under 8 MB."));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}
