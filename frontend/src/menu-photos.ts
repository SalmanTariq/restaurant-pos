import { isLogoDataUrl } from "./settings";
import type { MenuItem } from "./pos-types";

const DB_NAME = "pos-dish-photos";
const STORE = "photos";

function photoKey(restaurantId: string, itemId: string) {
  return `${restaurantId}:${itemId}`;
}

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMenuPhotos(
  restaurantId: string,
  menu: MenuItem[],
) {
  try {
    const db = await openPhotoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const keep = new Set(menu.map((item) => item.id));
      for (const item of menu) {
        if (isLogoDataUrl(item.imageDataUrl)) {
          store.put(item.imageDataUrl, photoKey(restaurantId, item.id));
        }
      }
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        const prefix = `${restaurantId}:`;
        if (key.startsWith(prefix) && !keep.has(key.slice(prefix.length))) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB is a cache; the server copy is the source of truth.
  }
}

export async function loadMenuPhotos(
  restaurantId: string,
): Promise<Record<string, string>> {
  const photos: Record<string, string> = {};
  try {
    const db = await openPhotoDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const key = String(cursor.key);
        const prefix = `${restaurantId}:`;
        if (key.startsWith(prefix) && isLogoDataUrl(cursor.value)) {
          photos[key.slice(prefix.length)] = cursor.value;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return photos;
  }
  return photos;
}

export function menuWithoutPhotos(menu: MenuItem[]): MenuItem[] {
  return menu.map((item) => ({ ...item, imageDataUrl: null }));
}

export function applyMenuPhotos(
  menu: MenuItem[],
  photos: Record<string, string>,
  fallback: MenuItem[] = [],
): MenuItem[] {
  const extras = new Map(fallback.map((item) => [item.id, item]));
  return menu.map((item) => {
    const image =
      (isLogoDataUrl(item.imageDataUrl) ? item.imageDataUrl : null) ||
      photos[item.id] ||
      extras.get(item.id)?.imageDataUrl ||
      null;
    return {
      ...item,
      imageDataUrl: isLogoDataUrl(image) ? image : null,
    };
  });
}
