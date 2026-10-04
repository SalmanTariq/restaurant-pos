import { expect, test } from '@playwright/test';
import { mockApi, signIn, waitForTill } from './helpers';
import type { TillPatch } from '../src/till-patch';

test('an offline payment survives a reload and sends a small patch on reconnect', async ({ page }) => {
  await mockApi(page);
  let offline = false;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => localStorage.getItem('test-offline') !== 'yes' });
  });
  await page.route('**/till', async route => {
    if (offline && route.request().method() === 'GET') await route.abort('internetdisconnected');
    else await route.fallback();
  });
  await page.route('**/api/auth/get-session**', async route => {
    if (offline) await route.abort('internetdisconnected');
    else await route.fallback();
  });
  const requests: TillPatch[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/till/sync') && request.method() === 'POST') requests.push(request.postDataJSON());
  });
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await expect(page.locator('.status-pill')).toContainText('Saved');
  requests.length = 0;
  offline = true;
  await page.evaluate(() => { localStorage.setItem('test-offline', 'yes'); window.dispatchEvent(new Event('offline')); });
  await page.getByRole('button', { name: /Chicken Karahi/ }).click();
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.getByRole('button', { name: /^Cash/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.status-pill')).toContainText('Offline');
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem('dmn_pos_till_outbox_v1:shop-1') || '{}')) as TillPatch;
  const order = journal.changes.find(change => change.collection === 'orders')!.after as any;
  expect(order.paidAt).toBeTruthy();
  expect(requests).toHaveLength(0);
  await page.reload(); await waitForTill(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Orders' }).click();
  await page.getByRole('tab', { name: /Paid/ }).click();
  await expect(page.getByRole('heading', { name: 'Token 8' })).toBeVisible();
  offline = false;
  await page.evaluate(() => { localStorage.removeItem('test-offline'); window.dispatchEvent(new Event('online')); });
  await expect(page.locator('.status-pill')).toContainText('Saved');
  expect(requests).toHaveLength(1);
  const sentOrder = requests[0].changes.find(change => change.collection === 'orders')!.after as any;
  expect(sentOrder.id).toBe(order.id);
  expect(sentOrder.paidAt).toBe(order.paidAt);
  expect(requests[0].changes.filter(change => change.collection === 'orders')).toHaveLength(1);
});
