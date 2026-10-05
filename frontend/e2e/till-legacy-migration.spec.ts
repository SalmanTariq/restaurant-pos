import { expect, test } from '@playwright/test';
import { migrateLegacyTill } from '../src/till-legacy-migration';
import { diffTill } from '../src/till-patch';
import type { TillSnapshot } from '../src/pos-types';
import { mockApi, sampleTill, signIn, waitForTill } from './helpers';

const snapshot = () => sampleTill() as TillSnapshot;

test('migrates an old day closure together with today’s missing order', () => {
  const remote = snapshot();
  remote.days.unshift({ date: '2026-10-04', openedAt: '2026-10-04T08:00:00Z',
    openedBy: 'Ayesha', pettyCash: 2000, closedAt: null });
  const local = structuredClone(remote);
  local.days[0].openedAt = '2026-10-04T08:00:00.112Z';
  local.days[0].closedAt = '2026-10-04T21:37:10.112Z';
  local.orders.unshift({ ...local.orders[0], id: 'today-unsynced', token: 8 });
  const recovered = migrateLegacyTill(local, remote);
  const changes = diffTill(remote, recovered).changes;
  expect(changes.filter(change => change.collection === 'orders')).toHaveLength(1);
  expect(changes.find(change => change.collection === 'days')).toEqual({
    collection: 'days', key: '2026-10-04', before: remote.days[0],
    after: { ...remote.days[0], closedAt: local.days[0].closedAt },
  });
  expect(diffTill(recovered, migrateLegacyTill(local, recovered)).changes).toEqual([]);
});

test('a day closure cannot hide changed petty cash or replace another closure', () => {
  const remote = snapshot(), local = structuredClone(remote);
  local.days[0].closedAt = new Date(Date.parse(local.days[0].openedAt) + 1000).toISOString();
  local.days[0].pettyCash += 100;
  expect(() => migrateLegacyTill(local, remote)).toThrow(/pettyCash: device/);
  local.days[0].pettyCash = remote.days[0].pettyCash;
  remote.days[0].closedAt = new Date(Date.parse(local.days[0].closedAt) + 1000).toISOString();
  expect(() => migrateLegacyTill(local, remote)).toThrow(/closedAt: device/);
});

test('a day closure before opening still requires review', () => {
  const remote = snapshot(), local = structuredClone(remote);
  local.days[0].closedAt = new Date(Date.parse(local.days[0].openedAt) - 1000).toISOString();
  expect(() => migrateLegacyTill(local, remote)).toThrow(/needs review/);
});

test('missing legacy paidAt keeps the server timestamp without rewriting history', () => {
  const local = snapshot(), remote = snapshot();
  remote.orders[0].paidAt = '2026-10-04T20:30:00.000Z';
  const recovered = migrateLegacyTill(local, remote);
  expect(recovered.orders[0].paidAt).toBe(remote.orders[0].paidAt);
  expect(diffTill(remote, recovered).changes).toEqual([]);
});

test('imports only absent orders and their matching inventory consumption', () => {
  const remote = snapshot(), local = structuredClone(remote);
  remote.orders[0].paidAt = '2026-10-04T20:30:00.000Z';
  local.orders.unshift({ ...local.orders[0], id: 'ord-1791058750980', token: 8 });
  local.menu.find(item => item.id === 'roti')!.stock -= 4;
  local.nextToken = 9;
  const recovered = migrateLegacyTill(local, remote);
  const changes = diffTill(remote, recovered).changes;
  expect(changes.filter(change => change.collection === 'orders')).toHaveLength(1);
  expect(recovered.orders.find(order => order.id === remote.orders[0].id)?.paidAt).toBe(remote.orders[0].paidAt);
  expect(recovered.menu.find(item => item.id === 'roti')!.stock).toBe(36);
});

test('genuine order differences still require review', () => {
  const local = snapshot(), remote = snapshot();
  local.orders[0].lines[0].qty += 1;
  expect(() => migrateLegacyTill(local, remote)).toThrow(/orders ord-paid.*needs review/);
});

test('does not ignore an existing but different payment timestamp', () => {
  const local = snapshot(), remote = snapshot();
  local.orders[0].paidAt = '2026-10-04T20:30:00.000Z';
  remote.orders[0].paidAt = '2026-10-04T21:30:00.000Z';
  expect(() => migrateLegacyTill(local, remote)).toThrow(/needs review/);
});

test('does not overwrite unexplained stock differences', () => {
  const local = snapshot(), remote = snapshot();
  local.menu[0].stock -= 1;
  expect(() => migrateLegacyTill(local, remote)).toThrow(/Unsynced stock.*needs review/);
});

test('does not apply inventory consumption twice when legacy stock already matches', () => {
  const remote = snapshot(), local = structuredClone(remote);
  local.orders.unshift({ ...local.orders[0], id: 'legacy-new', token: 8 });
  const changes = diffTill(remote, migrateLegacyTill(local, remote)).changes;
  expect(changes.some(change => change.collection === 'menu')).toBe(false);
});

test('a legacy device upgrades and saves its missing order without rewriting paid history', async ({ page }) => {
  const remote = snapshot(), local = structuredClone(remote);
  remote.orders[0].paidAt = '2026-10-04T20:30:00.000Z';
  local.orders.unshift({ ...local.orders[0], id: 'ord-1791058750980', token: 8 });
  local.nextToken = 9;
  local.menu.find(item => item.id === 'roti')!.stock -= 4;
  remote.days.unshift({ date: '2026-10-04', openedAt: '2026-10-04T08:00:00Z',
    openedBy: 'Ayesha', pettyCash: 2000, closedAt: null });
  local.days.unshift({ ...remote.days[0], closedAt: '2026-10-04T21:37:10.112Z' });
  await mockApi(page, { till: remote as unknown as Record<string, unknown> });
  await page.addInitScript(till => {
    localStorage.setItem('dmn_pos_orders:shop-1', JSON.stringify({ orders: till.orders, nextToken: till.nextToken }));
    localStorage.setItem('dmn_pos_menu:shop-1', JSON.stringify(till.menu));
    localStorage.setItem('dmn_pos_days:shop-1', JSON.stringify(till.days));
    localStorage.setItem('dmn_pos_books:shop-1', JSON.stringify({ expenses: till.expenses, staff: till.staff }));
    localStorage.setItem('dmn_pos_settings:shop-1', JSON.stringify(till.settings));
    localStorage.setItem('dmn_pos_till_dirty:shop-1', '1');
  }, local);
  const sent = page.waitForRequest(request => request.url().endsWith('/till/sync') && request.method() === 'POST');
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await expect(page.locator('.status-pill')).toContainText('Saved');
  const patch = (await sent).postDataJSON();
  expect(patch.changes.filter((change: any) => change.collection === 'orders')).toHaveLength(1);
  expect(patch.changes.find((change: any) => change.collection === 'orders').key).toBe('ord-1791058750980');
  expect(patch.changes.find((change: any) => change.collection === 'days')).toMatchObject({
    key: '2026-10-04', before: { closedAt: null }, after: { closedAt: '2026-10-04T21:37:10.112Z' },
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('all today’s legacy orders survive failed uploads and repeated reloads before recovery', async ({ page }) => {
  const remote = snapshot();
  remote.settings.useInventory = false;
  remote.days.unshift({ date: '2026-10-04', openedAt: '2026-10-04T08:00:00Z',
    openedBy: 'Ayesha', pettyCash: 2000, closedAt: null });
  const local = structuredClone(remote);
  local.days[0].closedAt = '2026-10-04T21:37:10.112Z';
  const unsynced = Array.from({ length: 20 }, (_, index) => ({
    ...structuredClone(local.orders[0]), id: `today-unsynced-${index}`, token: 8 + index,
  }));
  local.orders.unshift(...unsynced);
  local.nextToken = 28;
  const options = { till: remote as unknown as Record<string, unknown>, failTillPut: true };
  await mockApi(page, options);
  await page.addInitScript(till => {
    // Seed once: reload must recover the app's own persisted data.
    if (sessionStorage.getItem('legacy-seeded')) return;
    sessionStorage.setItem('legacy-seeded', '1');
    localStorage.setItem('dmn_pos_orders:shop-1', JSON.stringify({ orders: till.orders, nextToken: till.nextToken }));
    localStorage.setItem('dmn_pos_menu:shop-1', JSON.stringify(till.menu));
    localStorage.setItem('dmn_pos_days:shop-1', JSON.stringify(till.days));
    localStorage.setItem('dmn_pos_books:shop-1', JSON.stringify({ expenses: till.expenses, staff: till.staff }));
    localStorage.setItem('dmn_pos_settings:shop-1', JSON.stringify(till.settings));
    localStorage.setItem('dmn_pos_till_dirty:shop-1', '1');
  }, local);
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(page.getByRole('alert')).toContainText('Database write failed');
    const retained = await page.evaluate(() => ({
      orders: JSON.parse(localStorage.getItem('dmn_pos_orders:shop-1') || '{}').orders,
      outbox: JSON.parse(localStorage.getItem('dmn_pos_till_outbox_v1:shop-1') || '{}'),
    }));
    const retainedOrders = retained.orders.filter((order: any) => order.id.startsWith('today-unsynced-'));
    expect(retainedOrders).toEqual(expect.arrayContaining(unsynced));
    expect(retainedOrders).toHaveLength(20);
    expect(retained.outbox.changes.filter((change: any) => change.collection === 'orders')).toHaveLength(20);
    if (attempt < 2) { await page.reload(); await waitForTill(page); }
  }
  options.failTillPut = false;
  await page.reload(); await waitForTill(page);
  await expect(page.locator('.status-pill')).toContainText('Saved');
  expect(remote.orders.filter(order => order.id.startsWith('today-unsynced-')))
    .toEqual(expect.arrayContaining(unsynced));
  expect(remote.orders.filter(order => order.id.startsWith('today-unsynced-'))).toHaveLength(20);
});

test('a migration conflict still persists new orders locally', async ({ page }) => {
  const remote = snapshot(), local = structuredClone(remote);
  local.orders[0].lines[0].qty += 1;
  await mockApi(page, { till: remote as unknown as Record<string, unknown> });
  await page.addInitScript(till => {
    localStorage.setItem('dmn_pos_orders:shop-1', JSON.stringify({ orders: till.orders, nextToken: till.nextToken }));
    localStorage.setItem('dmn_pos_menu:shop-1', JSON.stringify(till.menu));
    localStorage.setItem('dmn_pos_days:shop-1', JSON.stringify(till.days));
    localStorage.setItem('dmn_pos_books:shop-1', JSON.stringify({ expenses: till.expenses, staff: till.staff }));
    localStorage.setItem('dmn_pos_settings:shop-1', JSON.stringify(till.settings));
    localStorage.setItem('dmn_pos_till_dirty:shop-1', '1');
  }, local);
  let requests = 0;
  page.on('request', request => { if (request.url().endsWith('/till/sync')) requests++; });
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await expect(page.getByRole('alert')).toContainText('needs review');
  await page.getByRole('button', { name: /Chicken Karahi/ }).click();
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.getByRole('button', { name: /^Cash/ }).click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('dmn_pos_orders:shop-1') || '{}');
    return saved.orders?.some((order: any) => order.token === 8 && order.status === 'paid');
  })).toBe(true);
  expect(requests).toBe(0);
});

test('adopts a corrected server date matching creation time without rewriting the order', () => {
  const local = snapshot(), remote = structuredClone(local);
  const id = `ord-${new Date(2026, 9, 5, 1, 22, 33).getTime()}`;
  local.orders[0] = { ...local.orders[0], id, date: '2026-10-04', time: '1:22 AM' };
  remote.orders[0] = { ...local.orders[0], date: '2026-10-05', paidAt: '2026-10-04T20:24:20.000Z' };
  const recovered = migrateLegacyTill(local, remote);
  expect(recovered.orders[0].date).toBe('2026-10-05');
  expect(recovered.orders[0].paidAt).toBe(remote.orders[0].paidAt);
  expect(diffTill(remote, recovered).changes).toEqual([]);
});

test('does not accept a server date that differs from creation time', () => {
  const local = snapshot(), remote = structuredClone(local);
  const id = `ord-${new Date(2026, 9, 5, 1, 22, 33).getTime()}`;
  local.orders[0] = { ...local.orders[0], id, date: '2026-10-04' };
  remote.orders[0] = { ...local.orders[0], date: '2026-10-06' };
  expect(() => migrateLegacyTill(local, remote)).toThrow(/needs review/);
});

test('a corrected date does not hide differing quantities or payment details', () => {
  const local = snapshot(), remote = structuredClone(local);
  const id = `ord-${new Date(2026, 9, 5, 1, 22, 33).getTime()}`;
  local.orders[0] = { ...local.orders[0], id, date: '2026-10-04' };
  remote.orders[0] = { ...local.orders[0], date: '2026-10-05', payment: 'online' };
  expect(() => migrateLegacyTill(local, remote)).toThrow(/payment: device "cash"; server "online"/);
});
