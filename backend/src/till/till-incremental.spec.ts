import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Order, OrderItem } from '../database/entities/order.entity';
import { MenuItem } from '../database/entities/menu-item.entity';
import { readLayout } from './till-snapshot';
import { DEFAULT_FLOOR } from './default-catalog';
import { Restaurant } from '../database/entities/restaurant.entity';
import { applyTillChanges } from './till-incremental';
import { TillService } from './till.service';

const wire = { id: 'ord-1791058750980', token: 9, type: 'takeaway', tableId: null,
  paidAt: '2026-09-24T10:01:00.000Z', date: '2026-10-04', time: '1:19 AM', status: 'paid', payment: 'cash',
  lines: [{ id: 'roti', name: 'Roti', price: 25, qty: 2 }] };

function setup(existing = true) {
  const createdAt = new Date('2026-09-24T10:00:00Z');
  const paidAt = new Date('2026-09-24T10:01:00Z');
  const order: any = existing ? { id: 123, restaurantId: 'shop', clientId: wire.id, tokenNumber: wire.token,
    businessDate: wire.date, type: wire.type, tableId: null, tableNumber: null, clockTime: wire.time,
    status: wire.status, paymentMethod: wire.payment, createdAt, paidAt,
    items: [{ clientItemId: 'roti', name: 'Roti', unitPrice: '25.00', quantity: 2 }] } : null;
  const restaurant = { id: 'shop', nextToken: 10 } as Restaurant;
  const em = {
    findOne: jest.fn(async (entity: any) => entity === Order ? order : null),
    create: jest.fn((_entity: any, values: any) => ({ ...values })),
    save: jest.fn(async (_entity: any, values?: any) => { if (values && !values.id) values.id = 456; return values || _entity; }),
    delete: jest.fn(async () => ({})), remove: jest.fn(async () => ({})),
  };
  return { em, restaurant, order, createdAt, paidAt };
}

describe('incremental till persistence', () => {
  it('preserves order IDs, creation and payment times on a payment edit', async () => {
    const { em, restaurant, order, createdAt, paidAt } = setup();
    await applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: wire, after: { ...wire, payment: 'online' } },
    ] });
    expect(order.id).toBe(123); expect(order.createdAt).toBe(createdAt); expect(order.paidAt).toBe(paidAt);
    expect(order.paymentMethod).toBe('online'); expect(em.delete).not.toHaveBeenCalled();
    expect(em.findOne.mock.calls.every(([entity]) => entity === Order)).toBe(true);
  });

  it('acknowledges a replay without writing or changing timestamps', async () => {
    const { em, restaurant } = setup();
    await applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: null, after: wire },
    ] });
    expect(em.save).not.toHaveBeenCalled(); expect(em.delete).not.toHaveBeenCalled();
  });

  it('rejects a stale edit without touching the record', async () => {
    const { em, restaurant } = setup();
    await expect(applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: { ...wire, payment: 'online' }, after: { ...wire, time: '2:00 AM' } },
    ] })).rejects.toBeInstanceOf(ConflictException);
    expect(em.save).not.toHaveBeenCalled(); expect(em.remove).not.toHaveBeenCalled();
  });

  it('creates only the new order and derives its creation time from the offline ID', async () => {
    const { em, restaurant } = setup(false);
    await applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: null, after: wire },
    ] });
    const saved = em.save.mock.calls.find(([entity]) => entity === Order)![1];
    expect(saved.createdAt.getTime()).toBe(1791058750980);
    expect(em.delete).toHaveBeenCalledWith(OrderItem, { order: { id: 456 } });
    expect(em.save.mock.calls.some(([entity]) => entity === MenuItem)).toBe(false);
  });

  it('deletes only the explicitly named order', async () => {
    const { em, restaurant, order } = setup();
    await applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: wire, after: null },
    ] });
    expect(em.remove).toHaveBeenCalledWith(Order, order);
    expect(em.delete).not.toHaveBeenCalled();
  });

  it('does not accept a duplicate token from another terminal', async () => {
    const { em, restaurant } = setup(false);
    em.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ clientId: 'someone-else' });
    await expect(applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'orders', key: wire.id, before: null, after: wire },
    ] })).rejects.toBeInstanceOf(ConflictException);
    expect(em.save).not.toHaveBeenCalled();
  });

  it('compares layout against the same default returned by the read API', async () => {
    const { em, restaurant } = setup();
    restaurant.floorPlan = null;
    const changed = DEFAULT_FLOOR.map((piece, index) => index === 0 ? { ...piece, x: piece.x + 10 } : piece);
    await applyTillChanges(em as unknown as EntityManager, restaurant, { changes: [
      { collection: 'layout', key: 'layout', before: DEFAULT_FLOOR, after: changed },
    ] });
    expect(restaurant.floorPlan).toEqual(readLayout(changed));
  });

  it('rejects destructive legacy saves', async () => {
    await expect(TillService.prototype.save('shop', {})).rejects.toBeInstanceOf(ConflictException);
  });
});
