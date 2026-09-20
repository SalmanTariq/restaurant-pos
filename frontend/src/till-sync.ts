import type { TillSnapshot } from "./pos-types";
import { readTenantItem, writeTenantItem } from "./tenant-storage";

export const TILL_DIRTY_KEY = "dmn_pos_till_dirty";

export type TillSyncStatus = "saved" | "saving" | "queued" | "error";

export type TillSyncState = {
  status: TillSyncStatus;
  error: string | null;
};

export function tillIsDirty(restaurantId: string) {
  try {
    return readTenantItem(TILL_DIRTY_KEY, restaurantId) === "1";
  } catch {
    return false;
  }
}

export function markTillDirty(restaurantId: string) {
  try {
    writeTenantItem(TILL_DIRTY_KEY, restaurantId, "1");
  } catch {
    // quota — still PUT to the server
  }
}

export function clearTillDirty(restaurantId: string) {
  try {
    writeTenantItem(TILL_DIRTY_KEY, restaurantId, "0");
  } catch {
    // ignore
  }
}

export function isBrowserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function saveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not save to the server";
}

export function createTillPusher(options: {
  put: (body: TillSnapshot) => Promise<unknown>;
  isOnline?: () => boolean;
  onSaved?: (till: TillSnapshot) => void;
  onStatus?: (state: TillSyncState) => void;
}) {
  const isOnline = options.isOnline ?? isBrowserOnline;
  let inflight = false;
  let queued: TillSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;

  function setStatus(status: TillSyncStatus, error: string | null = null) {
    options.onStatus?.({ status, error });
  }

  function enqueue(till: TillSnapshot) {
    queued = till;
    if (!isOnline()) {
      setStatus("queued");
      return;
    }
    void drain();
  }

  async function drain() {
    if (inflight) return;
    if (!isOnline()) {
      if (queued) setStatus("queued");
      return;
    }
    const payload = queued;
    if (!payload) return;
    queued = null;
    inflight = true;
    setStatus("saving");
    try {
      await options.put(payload);
      retry = 0;
      if (!queued) {
        options.onSaved?.(payload);
        setStatus("saved");
      }
    } catch (error) {
      queued = queued ?? payload;
      setStatus("error", saveErrorMessage(error));
      if (isOnline()) {
        retry = Math.min(retry + 1, 5);
        timer = window.setTimeout(() => {
          timer = null;
          void drain();
        }, 800 * 2 ** retry);
      }
    } finally {
      inflight = false;
    }
    if (queued && !timer && isOnline()) void drain();
  }

  function flushNow() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    return drain();
  }

  function onOnline() {
    void drain();
  }

  function onOffline() {
    if (queued || inflight) setStatus("queued");
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }

  function stop() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
  }

  return { enqueue, flushNow, stop };
}
