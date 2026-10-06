import { expect, test } from '@playwright/test';
import { createTillPusher } from '../src/till-sync';
import { ApiError } from '../src/api';
import { applyOutbox, applyPatch, diffTill, type TillPatch } from '../src/till-patch';
import { sampleTill } from './helpers';
import type { TillSnapshot } from '../src/pos-types';

const snapshot = () => sampleTill() as TillSnapshot;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('only changed records travel, including explicit deletions', () => {
  const base = snapshot();
  const next = structuredClone(base);
  for (let i = 0; i < 1000; i++) base.orders.push({ ...base.orders[0], id: `history-${i}` });
  next.orders = structuredClone(base.orders);
  next.orders.unshift({ ...base.orders[0], id: 'new-order', token: 1001 });
  const patch = diffTill(base, next);
  expect(patch.changes).toHaveLength(1);
  expect(patch.changes[0].key).toBe('new-order');
  next.orders.pop();
  expect(diffTill(base, next).changes.some(change => change.after === null)).toBe(true);
});

test('offline edits coalesce and send only after reconnect', async () => {
  let online = false;
  const requests: TillPatch[] = [];
  let journal: TillPatch | undefined;
  const base = snapshot(), next = structuredClone(base);
  const pusher = createTillPusher({ isOnline: () => online, put: async patch => { requests.push(patch); }, persist: patch => { journal = patch; } });
  pusher.initialize(base);
  next.orders.unshift({ ...base.orders[0], id: 'offline', token: 8 });
  pusher.enqueue(next);
  next.orders[0].token = 9;
  pusher.enqueue(next);
  expect(requests).toHaveLength(0);
  expect(journal?.changes).toHaveLength(1);
  online = true;
  await pusher.flushNow();
  expect(requests[0].changes[0].after).toMatchObject({ id: 'offline', token: 9 });
  expect(journal?.changes).toHaveLength(0);
  pusher.stop();
});

test('reload preserves original conflict checks and other tills’ orders', async () => {
  const base = snapshot(), next = structuredClone(base);
  next.orders[0].payment = 'online';
  const patch = diffTill(base, next);
  const remote = structuredClone(base);
  remote.orders.unshift({ ...base.orders[0], id: 'another-till', token: 99 });
  remote.orders[1].payment = 'online';
  let sent: TillPatch | undefined;
  const pusher = createTillPusher({ isOnline: () => true, put: async body => { sent = body; } });
  pusher.initialize(remote, patch);
  pusher.enqueue(applyPatch(remote, patch));
  await tick();
  expect(sent?.changes).toEqual(patch.changes);
  expect(sent?.changes.some(change => change.key === 'another-till')).toBe(false);
  pusher.stop();
});

test('edits made during a lost acknowledgement survive reload as two ordered patches', async () => {
  const base = snapshot(), next = structuredClone(base);
  let resolve!: () => void;
  let journal!: TillPatch;
  const first = createTillPusher({ isOnline: () => true,
    put: () => new Promise<void>(done => { resolve = done; }), persist: body => { journal = structuredClone(body); } });
  first.initialize(base);
  next.orders[0].payment = 'online';
  first.enqueue(next);
  const intermediate = structuredClone(next);
  next.orders[0].time = '2:00 PM';
  first.enqueue(next);
  expect(journal.submitted?.changes[0].after).toMatchObject({ time: base.orders[0].time });
  const requests: TillPatch[] = [];
  const restarted = createTillPusher({ isOnline: () => true, put: async body => { requests.push(body); } });
  restarted.initialize(intermediate, journal);
  restarted.enqueue(applyPatch(intermediate, journal));
  await tick(); await tick();
  expect(requests).toHaveLength(2);
  expect(requests[0].changes[0].after).toMatchObject({ payment: 'online', time: base.orders[0].time });
  expect(requests[1].changes[0].before).toMatchObject({ payment: 'online', time: base.orders[0].time });
  expect(requests[1].changes[0].after).toMatchObject({ time: '2:00 PM' });
  first.stop(); resolve(); restarted.stop();
});

test('conflicts retain the outbox and do not retry automatically', async () => {
  const base = snapshot(), next = structuredClone(base);
  next.orders[0].payment = 'online';
  let calls = 0, journal: TillPatch | undefined;
  const pusher = createTillPusher({ isOnline: () => true, put: async () => { calls++; throw new ApiError('Conflict', 409); }, persist: body => { journal = body; } });
  pusher.initialize(base); pusher.enqueue(next);
  await tick(); await pusher.flushNow();
  expect(calls).toBe(1);
  expect(journal?.changes).toHaveLength(1);
  pusher.stop();
});

test('keeping the local ticket rebases before and retries', async () => {
  const base = snapshot(), next = structuredClone(base);
  next.orders[0].payment = 'online';
  const server = { ...base.orders[0], payment: 'cash' as const, time: '3:00 PM' };
  const sent: TillPatch[] = [];
  const pusher = createTillPusher({
    isOnline: () => true,
    put: async (patch) => {
      sent.push(patch);
      if (sent.length === 1) {
        throw new ApiError('Another till changed orders ord-paid.', 409, {
          collection: 'orders',
          key: 'ord-paid',
          current: server,
          before: base.orders[0],
          after: next.orders[0],
        });
      }
    },
  });
  pusher.initialize(base);
  pusher.enqueue(next);
  await tick();
  pusher.resolveConflict('local');
  await tick();
  expect(sent).toHaveLength(2);
  expect(sent[1].changes[0]).toMatchObject({ key: 'ord-paid', before: server, after: next.orders[0] });
  pusher.stop();
});

test('keeping the server ticket drops that change and restores the row', async () => {
  const base = snapshot(), next = structuredClone(base);
  next.orders = [];
  const server = base.orders[0];
  let journal: TillPatch | undefined;
  const sent: TillPatch[] = [];
  const pusher = createTillPusher({
    isOnline: () => true,
    persist: (body) => { journal = body; },
    put: async (patch) => {
      sent.push(patch);
      throw new ApiError('Another till changed orders ord-paid.', 409, {
        collection: 'orders',
        key: 'ord-paid',
        current: server,
        before: server,
        after: null,
      });
    },
  });
  pusher.initialize(base);
  pusher.enqueue(next);
  await pusher.flushNow();
  const till = pusher.resolveConflict('server');
  await tick();
  expect(sent).toHaveLength(1);
  expect(till?.orders).toEqual([server]);
  expect(journal?.changes ?? []).toHaveLength(0);
  pusher.stop();
});

test('storage failure prevents sending an undurable operation', async () => {
  let calls = 0;
  const base = snapshot(), next = structuredClone(base);
  next.orders[0].payment = 'online';
  const pusher = createTillPusher({ isOnline: () => true, put: async () => { calls++; }, persist: () => { throw new Error('quota'); } });
  pusher.initialize(base); pusher.enqueue(next); await pusher.flushNow();
  expect(calls).toBe(0); pusher.stop();
});

test('a reverted edit still replays its uncertain submitted operation before reverting it', async () => {
  const base = snapshot(), intermediate = structuredClone(base);
  intermediate.orders[0].payment = 'online';
  const submitted = diffTill(base, intermediate);
  const journal: TillPatch = { changes: [], submitted, following: diffTill(intermediate, base) };
  const sent: TillPatch[] = [];
  const pusher = createTillPusher({ isOnline: () => true, put: async patch => { sent.push(patch); } });
  // The server might already have applied the submitted operation.
  pusher.initialize(intermediate, journal);
  // The cached local view retains the subsequent reversion.
  pusher.enqueue(applyOutbox(intermediate, journal));
  await tick(); await tick();
  expect(sent).toHaveLength(2);
  expect(sent[0].changes[0].after).toMatchObject({ payment: 'online' });
  expect(sent[1].changes[0].after).toMatchObject({ payment: 'cash' });
  pusher.stop();
});
