import type { TillSnapshot } from "./pos-types";
import { readTenantItem, writeTenantItem } from "./tenant-storage";

export const TILL_DIRTY_KEY = "dmn_pos_till_dirty";

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

export function createTillPusher(options: {
  put: (body: TillSnapshot) => Promise<unknown>;
  onSaved?: () => void;
  delayMs?: number;
}) {
  const delayMs = options.delayMs ?? 200;
  let inflight = false;
  let queued: TillSnapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;
  let stopped = false;

  function enqueue(till: TillSnapshot) {
    if (stopped) return;
    queued = till;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  }

  async function drain() {
    if (stopped || inflight) return;
    const payload = queued;
    if (!payload) return;
    queued = null;
    inflight = true;
    try {
      await options.put(payload);
      retry = 0;
      if (!queued) options.onSaved?.();
    } catch {
      queued = queued ?? payload;
      retry = Math.min(retry + 1, 5);
      timer = window.setTimeout(() => {
        timer = null;
        void drain();
      }, 400 * 2 ** retry);
    } finally {
      inflight = false;
    }
    if (queued && !timer) void drain();
  }

  function flushNow() {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    return drain();
  }

  function stop() {
    stopped = true;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  return { enqueue, flushNow, stop };
}
