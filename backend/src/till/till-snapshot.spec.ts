import { BadRequestException } from '@nestjs/common';
import { DEFAULT_FLOOR } from './default-catalog';
import { DEFAULT_MENU_CATEGORIES } from './menu-categories';
import {
  asDate,
  asLayout,
  isLogoDataUrl,
  money,
  moneyStr,
  normalizeOrder,
  normalizeTillSnapshot,
  readLayout,
} from './till-snapshot';

describe('till snapshot helpers', () => {
  it('treats non-numeric money as zero', () => {
    expect(money('12.5')).toBe(12.5);
    expect(money('nope')).toBe(0);
    expect(money(undefined)).toBe(0);
  });

  it('formats money with two decimals', () => {
    expect(moneyStr(9)).toBe('9.00');
  });

  it('formats dates as YYYY-MM-DD', () => {
    expect(asDate('2026-09-21T12:00:00.000Z')).toBe('2026-09-21');
    expect(asDate(new Date('2026-01-02T00:00:00.000Z'))).toBe('2026-01-02');
  });

  it('accepts jpeg data URLs for photos', () => {
    expect(isLogoDataUrl('data:image/jpeg;base64,abcd')).toBe(true);
    expect(isLogoDataUrl('https://example.com/a.jpg')).toBe(false);
  });
});

describe('readLayout', () => {
  it('falls back to the default floor when empty', () => {
    expect(readLayout(null)).toEqual(DEFAULT_FLOOR);
    expect(readLayout([])).toEqual(DEFAULT_FLOOR);
  });

  it('keeps valid table pieces', () => {
    const layout = readLayout([
      { id: 'T9', x: 1, y: 2, w: 10, h: 12, shape: 'rect', kind: 'table' },
    ]);
    expect(layout).toEqual([
      {
        id: 'T9',
        x: 1,
        y: 2,
        w: 10,
        h: 12,
        shape: 'rect',
        kind: 'table',
      },
    ]);
  });

  it('drops pieces without coordinates', () => {
    expect(asLayout({ id: 'T1' })).toBeNull();
    expect(asLayout(null)).toBeNull();
  });
});

describe('normalizeTillSnapshot', () => {
  it('rejects a body without a menu array', () => {
    expect(() => normalizeTillSnapshot({})).toThrow(BadRequestException);
  });

  it('fills defaults and clamps money', () => {
    const snapshot = normalizeTillSnapshot({
      menu: [{ name: '  Tea  ', price: -4, stock: 2.8, active: false }],
    });
    expect(snapshot.menu[0]).toMatchObject({
      name: 'Tea',
      nameUrdu: '',
      category: 'Other',
      price: 0,
      stock: 2,
      active: false,
    });
    expect(snapshot.nextToken).toBe(1);
    expect(snapshot.settings.restaurantName).toBe('Restaurant');
    expect(snapshot.settings.requirePettyCash).toBe(true);
    expect(snapshot.categories).toEqual(
      expect.arrayContaining(['Other', ...DEFAULT_MENU_CATEGORIES.filter((n) => n !== 'Other')]),
    );
  });

  it('keeps named settings, paid orders, and categories', () => {
    const snapshot = normalizeTillSnapshot({
      menu: [{ id: 'roti', name: 'Roti', nameUrdu: 'روٹی', category: 'Breads', price: 25, stock: 10 }],
      categories: ['Breads', 'Karahi'],
      nextToken: 4.2,
      settings: {
        restaurantName: '  Test Kitchen  ',
        logoDataUrl: 'data:image/png;base64,xx',
        requirePettyCash: false,
        useInventory: false,
      },
      orders: [
        {
          id: 'ord-1',
          token: 3,
          type: 'dine-in',
          tableId: 'T1',
          status: 'paid',
          payment: 'cash',
          date: '2026-09-21',
          time: '1:00 PM',
          lines: [{ id: 'roti', name: 'Roti', price: 25, qty: 2 }],
        },
      ],
      expenses: [{ title: 'Gas', category: 'Utilities', amount: 50, date: '2026-09-21' }],
      staff: [{ name: 'Ali', dailyWage: 1000 }],
      days: [
        {
          date: '2026-09-21',
          openedAt: '2026-09-21T08:00:00.000Z',
          pettyCash: 500,
          openedBy: 'Ali',
        },
      ],
    });
    expect(snapshot.settings.restaurantName).toBe('Test Kitchen');
    expect(snapshot.settings.requirePettyCash).toBe(false);
    expect(snapshot.settings.useInventory).toBe(false);
    expect(snapshot.nextToken).toBe(4);
    expect(snapshot.menu[0].nameUrdu).toBe('روٹی');
    expect(snapshot.categories).toEqual(['Breads', 'Karahi']);
    expect(snapshot.orders[0]).toMatchObject({
      status: 'paid',
      payment: 'cash',
      type: 'dine-in',
      lines: [{ qty: 2, price: 25 }],
    });
    expect(snapshot.expenses[0].title).toBe('Gas');
    expect(snapshot.staff[0].name).toBe('Ali');
    expect(snapshot.days[0].closedAt).toBeNull();
    expect(snapshot.days[0].pettyCash).toBe(500);
  });

  it('drops unknown payment methods and treats unknown status as open', () => {
    const order = normalizeOrder(
      {
        id: 'x',
        token: 1,
        type: 'takeaway',
        tableId: null,
        status: 'open',
        date: '2026-09-21',
        time: '2:00 PM',
        payment: 'card' as 'cash',
        lines: [],
      },
      0,
    );
    expect(order.payment).toBeUndefined();
    expect(order.status).toBe('open');
  });
});
