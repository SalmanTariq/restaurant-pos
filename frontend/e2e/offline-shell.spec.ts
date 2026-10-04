import { expect, test } from '@playwright/test';
import { mockApi, signIn, waitForTill } from './helpers';
import type { TillPatch } from '../src/till-patch';

test('production app reloads and keeps taking orders with the network disconnected', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'production-offline', 'Requires the production service worker');
  await mockApi(page);
  let offline = false;
  await page.route('**/api/auth/get-session**', async route => offline ? route.abort('internetdisconnected') : route.fallback());
  await page.route('**/till', async route => offline ? route.abort('internetdisconnected') : route.fallback());
  const patches: TillPatch[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/till/sync')) patches.push(request.postDataJSON());
  });
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('pos_offline_identity')))).toBe(true);
  await expect(page.locator('.status-pill')).toContainText('Saved');
  patches.length = 0;
  offline = true;
  await context.setOffline(true);
  await page.getByRole('button', { name: /Chicken Karahi/ }).click();
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.getByRole('button', { name: /^Cash/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.status-pill')).toContainText('Offline');
  expect(patches).toHaveLength(0);
  await page.reload();
  await waitForTill(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Orders' }).click();
  await page.getByRole('tab', { name: /Paid/ }).click();
  await expect(page.getByRole('heading', { name: 'Token 8' })).toBeVisible();
  offline = false;
  await context.setOffline(false);
  await expect(page.locator('.status-pill')).toContainText('Saved');
  expect(patches).toHaveLength(1);
  expect(patches[0].changes.filter(change => change.collection === 'orders')).toHaveLength(1);
});
