import { ApiError } from "./api";
import { applyPatch, diffTill, type TillPatch } from "./till-patch";
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

export const TILL_OUTBOX_KEY = "dmn_pos_till_outbox_v1";

export function readTillOutbox(restaurantId: string): TillPatch | null {
  const raw = localStorage.getItem(`${TILL_OUTBOX_KEY}:${restaurantId}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as TillPatch;
  if (!Array.isArray(parsed.changes)) throw new Error("The offline queue could not be read. Local data has been retained.");
  return parsed;
}

export function writeTillOutbox(restaurantId: string, patch: TillPatch) {
  // Failing this write must stop sync; never claim an undurable offline save.
  writeTenantItem(TILL_OUTBOX_KEY, restaurantId, JSON.stringify(patch));
}

export function createTillPusher(options: {
  put: (body: TillPatch) => Promise<unknown>;
  isOnline?: () => boolean;
  persist?: (patch: TillPatch) => void;
  onSaved?: (till: TillSnapshot) => void;
  onStatus?: (state: TillSyncState) => void;
}) {
  const isOnline = options.isOnline ?? isBrowserOnline;
  let inflight = false;
  let queued: TillSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;
  let base: TillSnapshot | null = null;
  let blocked = false;
  let stopped = false;
  let submitted: TillPatch | null = null;

  function setStatus(status: TillSyncStatus, error: string | null = null) {
    options.onStatus?.({ status, error });
  }

  function initialize(snapshot: TillSnapshot, pending?: TillPatch | null) {
    base = pending ? applyPatch(snapshot, pending, "before") : structuredClone(snapshot);
    if (pending?.following) base = applyPatch(base, pending.following, "before");
    if (pending?.submitted) base = applyPatch(base, pending.submitted, "before");
    submitted = pending?.submitted || null;
    blocked = false;
  }

  function journal(desired: TillSnapshot): TillPatch {
    return { ...diffTill(base!, desired), ...(submitted ? {
      submitted, following: diffTill(applyPatch(base!, submitted), desired),
    } : {}) };
  }

  function enqueue(till: TillSnapshot) {
    if (stopped) return;
    if (!base) { setStatus("error", "Load the till before saving."); return; }
    queued = structuredClone(till);
    try { options.persist?.(journal(queued)); }
    catch { blocked = true; setStatus("error", "Device storage is full. Keep this window open; offline changes could not be saved."); return; }
    if (blocked) return;
    if (!isOnline()) {
      setStatus("queued");
      return;
    }
    void drain();
  }

  async function drain() {
    if (inflight || blocked || stopped) return;
    if (!isOnline()) {
      if (queued) setStatus("queued");
      return;
    }
    if (!queued && !submitted) return;
    const payload = submitted ? applyPatch(base!, submitted) : queued!;
    if (!submitted) queued = null;
    inflight = true;
    setStatus("saving");
    try {
      const patch = submitted || diffTill(base!, payload);
      submitted = patch;
      options.persist?.(journal(queued || payload));
      if (patch.changes.length) await options.put(patch);
      base = payload;
      submitted = null;
      options.persist?.(queued ? diffTill(base, queued) : { changes: [] });
      retry = 0;
      if (!queued) {
        options.onSaved?.(payload);
        setStatus("saved");
      }
    } catch (error) {
      queued = queued ?? payload;
      setStatus("error", saveErrorMessage(error));
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        blocked = true;
      }
      if (!blocked && isOnline()) {
        retry = Math.min(retry + 1, 5);
        timer = window.setTimeout(() => {
          timer = null;
          void drain();
        }, 800 * 2 ** retry);
      }
    } finally {
      inflight = false;
    }
    if (queued && !blocked && !stopped && !timer && isOnline()) void drain();
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

  function start() {
    stopped = false;
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    }
  }

  function stop() {
    stopped = true;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
  }

  return { initialize, enqueue, flushNow, start, stop };
}
