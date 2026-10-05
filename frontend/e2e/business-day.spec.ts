import { expect, test } from '@playwright/test';
import { businessDayDate, businessDayRange, currentBusinessDay, nextTokenForDay } from '../src/business-day';
import { mockApi, sampleTill, signIn, waitForTill } from './helpers';

test('business day rolls over at 10am and filters through 3am the following date', () => {
  expect(businessDayRange(new Date(2026, 9, 6, 1))).toEqual({
    from: '2026-10-05', to: '2026-10-06', fromTime: '10:00', toTime: '03:00',
  });
  expect(currentBusinessDay(new Date(2026, 9, 6, 9, 59))).toBe('2026-10-05');
  expect(currentBusinessDay(new Date(2026, 9, 6, 10))).toBe('2026-10-06');
  expect(businessDayDate('2027-01-01', '1:00 AM')).toBe('2026-12-31');
});

test('token numbering continues after midnight and resets for the next business day', () => {
  const order = sampleTill().orders[0];
  const orders = [
    { ...order, date: '2026-10-05', time: '11:00 PM', token: 4 },
    { ...order, date: '2026-10-06', time: '1:00 AM', token: 5 },
  ];
  expect(nextTokenForDay(orders, '2026-10-05')).toBe(6);
  expect(nextTokenForDay(orders, '2026-10-06')).toBe(1);
});

test('Orders defaults to the current business day and can show older tickets', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 6, 1));
  const till = sampleTill();
  const base = till.orders[0];
  till.orders = [
    { ...base, id: 'evening', date: '2026-10-05', time: '10:00 AM', token: 1 },
    { ...base, id: 'overnight', date: '2026-10-06', time: '3:00 AM', token: 2 },
    { ...base, id: 'outside', date: '2026-10-06', time: '3:01 AM', token: 3 },
    { ...base, id: 'older', date: '2026-10-04', time: '11:00 PM', token: 99 },
  ];
  await mockApi(page, { till });
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Orders' }).click();
  await page.getByRole('tab', { name: /Paid/ }).click();
  await expect(page.getByRole('tab', { name: /Paid/ })).toContainText('2');
  await expect(page.locator('.rail-card')).toHaveCount(2);
  await expect(page.getByLabel('From time')).toHaveValue('10:00');
  await expect(page.getByLabel('To time')).toHaveValue('03:00');
  await page.locator('input[type=date]').first().fill('2026-10-04');
  await expect(page.locator('.rail-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Today’s business day' }).click();
  await expect(page.locator('.rail-card')).toHaveCount(2);
});

test('new business-day tokens start at one, continue across midnight, and survive reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 6, 10));
  const till = sampleTill();
  till.orders[0] = { ...till.orders[0], date: '2026-10-06', time: '1:00 AM', token: 50 };
  till.nextToken = 51;
  await mockApi(page, { till });
  await signIn(page, 'owner@test.com'); await waitForTill(page);
  await expect(page.locator('.token-chip')).toHaveText('Token 1');
  await page.getByRole('button', { name: /Chicken Karahi/ }).click();
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.getByRole('button', { name: /^Cash/ }).click();
  await expect(page.locator('.status-pill')).toContainText('Saved');
  await expect(page.locator('.token-chip')).toHaveText('Token 2');
  await page.clock.setFixedTime(new Date(2026, 9, 7, 1));
  await page.reload(); await waitForTill(page);
  await expect(page.locator('.token-chip')).toHaveText('Token 2');
  // Removing the latest ticket must not let a reload reuse its token.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Orders' }).click();
  await page.getByRole('tab', { name: /Paid/ }).click();
  await page.getByRole('button', { name: /Delete order/ }).click();
  await page.getByRole('button', { name: 'Delete token 1', exact: true }).click();
  await expect(page.locator('.status-pill')).toContainText('Saved');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Order', exact: true }).click();
  await page.reload(); await waitForTill(page);
  await expect(page.locator('.token-chip')).toHaveText('Token 2');
  await page.clock.setFixedTime(new Date(2026, 9, 7, 10));
  // A running till also rolls over without needing a refresh.
  await expect(page.locator('.token-chip')).toHaveText('Token 1');
  expect(till.orders.find(order => order.token === 50)?.date).toBe('2026-10-06');
});
