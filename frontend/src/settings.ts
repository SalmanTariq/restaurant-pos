import type { PosSettings } from "./pos-types";
import { readTenantItem } from "./tenant-storage";

export const SETTINGS_KEY = "dmn_pos_settings";
export const DEFAULT_RESTAURANT_NAME = "Restaurant";

export const DEFAULT_SETTINGS: PosSettings = {
  restaurantName: DEFAULT_RESTAURANT_NAME,
  logoDataUrl: null,
  requirePettyCash: true,
  useInventory: true,
  useTables: true,
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
    useTables: entry.useTables !== false,
  };
}

export function loadSettings(restaurantId?: string | null): PosSettings {
  if (!restaurantId) return { ...DEFAULT_SETTINGS };
  try {
    const raw = readTenantItem(SETTINGS_KEY, restaurantId);
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

export const DISH_PHOTO_SIZE = 720;

export function openDishPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a PNG or JPG photo."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Photo must be under 8 MB."));
      return;
    }
    resolve(URL.createObjectURL(file));
  });
}

export function exportSquareDishPhoto(
  image: HTMLImageElement,
  panX: number,
  panY: number,
  zoom: number,
): string {
  const z = Math.min(3, Math.max(1, zoom));
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const crop = Math.min(width, height) / z;
  const x = Math.min(width - crop, Math.max(0, panX * (width - crop)));
  const y = Math.min(height - crop, Math.max(0, panY * (height - crop)));
  const canvas = document.createElement("canvas");
  canvas.width = DISH_PHOTO_SIZE;
  canvas.height = DISH_PHOTO_SIZE;
  const ctx = dishPhotoContext(canvas);
  if (!ctx) throw new Error("Could not crop that photo.");
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, DISH_PHOTO_SIZE, DISH_PHOTO_SIZE);
  ctx.drawImage(image, x, y, crop, crop, 0, 0, DISH_PHOTO_SIZE, DISH_PHOTO_SIZE);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function dishPhotoContext(canvas: HTMLCanvasElement) {
  const wide = { colorSpace: "display-p3", alpha: false } as CanvasRenderingContext2DSettings;
  return (
    canvas.getContext("2d", wide) ??
    canvas.getContext("2d", { alpha: false }) ??
    canvas.getContext("2d")
  );
}

