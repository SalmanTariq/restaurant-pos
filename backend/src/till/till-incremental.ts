import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BusinessDay } from '../database/entities/business-day.entity';
import { Expense } from '../database/entities/expense.entity';
import { MenuItem } from '../database/entities/menu-item.entity';
import { Order, OrderItem } from '../database/entities/order.entity';
import { Restaurant } from '../database/entities/restaurant.entity';
import { WageStaff } from '../database/entities/wage-staff.entity';
import { asDate, money, moneyStr, normalizeTillSnapshot, readLayout } from './till-snapshot';
import { mergeMenuCategories } from './menu-categories';
import { rowCollections, rowKey, sameRow, stable, TillPatch } from './till-patch';

const entities: Record<string, any> = { menu: MenuItem, orders: Order, expenses: Expense, staff: WageStaff, days: BusinessDay };

function toWire(collection: string, row: any): any {
  if (!row) return null;
  switch (collection) {
    case 'menu': return { id: row.clientId, name: row.name, nameUrdu: row.nameUrdu || '', category: row.category,
      price: money(row.salePrice), stock: row.stock, active: row.isActive, imageDataUrl: row.imageDataUrl || null };
    case 'orders': return { id: row.clientId, token: row.tokenNumber, type: row.type, tableId: row.tableId ?? row.tableNumber,
      date: asDate(row.businessDate), time: row.clockTime, status: row.status, payment: row.paymentMethod || undefined, paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : undefined,
      lines: row.items.map((line: any) => ({ id: line.clientItemId || '', name: line.name, price: money(line.unitPrice), qty: line.quantity })) };
    case 'expenses': return { id: row.clientId, title: row.title, category: row.category, amount: money(row.amount), date: asDate(row.date), notes: row.notes || '', staffId: row.staffId || undefined };
    case 'staff': return { id: row.clientId, name: row.name, dailyWage: money(row.dailyWage) };
    case 'days': return { date: asDate(row.date), openedAt: new Date(row.openedAt).toISOString(), pettyCash: money(row.pettyCash), openedBy: row.openedBy,
      closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null };
  }
}

function settings(restaurant: Restaurant) {
  return { restaurantName: restaurant.name, logoDataUrl: restaurant.logoDataUrl,
    requirePettyCash: restaurant.requirePettyCash, useInventory: restaurant.useInventory, useTables: restaurant.useTables };
}

// Normalization is confined to the supplied record, never a replacement snapshot.
function normalized(collection: string, value: any): any {
  if (value === null) return null;
  const body: any = { menu: [], [collection]: rowCollections.includes(collection as any) ? [value] : value };
  const result: any = normalizeTillSnapshot(body);
  return rowCollections.includes(collection as any) ? result[collection][0] : result[collection];
}

export async function applyTillChanges(em: EntityManager, restaurant: Restaurant, patch: TillPatch) {
  if (!patch || !Array.isArray(patch.changes) || patch.changes.length > 10000) throw new BadRequestException('Invalid till changes.');
  // Compare the catalog as it was at transaction start, before a menu rename
  // in this same patch changes the derived category list.
  const currentCategories = patch.changes.some(change => change?.collection === 'categories')
    ? mergeMenuCategories(restaurant.menuCategories, (await em.find(MenuItem, { where: { restaurantId: restaurant.id } })).map(item => item.category))
    : undefined;
  const seen = new Set<string>();
  for (const change of patch.changes) {
    if (!change || typeof change.key !== 'string' || !change.key || change.before === undefined || change.after === undefined) {
      throw new BadRequestException('Every change needs a key, before, and after.');
    }
    const { collection, key } = change;
    const identity = `${collection}:${key}`;
    if (seen.has(identity)) throw new BadRequestException('Duplicate change.');
    seen.add(identity);
    const entity: any = entities[collection];
    if (!entity && !['settings', 'layout', 'categories', 'nextToken'].includes(collection)) throw new BadRequestException('Unknown till collection.');
    if (!entity && (key !== collection || change.after === null)) throw new BadRequestException('Invalid till property.');
    const before = normalized(collection, change.before), after = normalized(collection, change.after);
    if (entity && ((before && rowKey(collection, before) !== key) || (after && rowKey(collection, after) !== key))) throw new BadRequestException('Record key mismatch.');
    const where: any = collection === 'days' ? { restaurantId: restaurant.id, date: key } : { restaurantId: restaurant.id, clientId: key };
    const row: any = entity ? await em.findOne(entity, { where, ...(collection === 'orders' ? { relations: ['items'] } : {}) }) : null;
    const current = entity ? toWire(collection, row) : collection === 'settings' ? settings(restaurant)
      : collection === 'layout' ? normalized('layout', readLayout(restaurant.floorPlan)) : collection === 'categories' ? currentCategories : restaurant.nextToken;
    // A retry after a lost response is an acknowledgement, not another write.
    if (sameRow(collection, current, after)) continue;
    if (collection === 'nextToken') {
      restaurant.nextToken = Math.max(restaurant.nextToken, after);
      await em.save(restaurant);
      continue;
    }
    if (!sameRow(collection, current, before)) throw new ConflictException(`Another till changed ${collection} ${key}. Your local work is retained; resolve this conflict before syncing.`);
    if (!entity) {
      if (collection === 'settings') Object.assign(restaurant, { name: after.restaurantName, logoDataUrl: after.logoDataUrl,
        requirePettyCash: after.requirePettyCash, useInventory: after.useInventory, useTables: after.useTables });
      if (collection === 'layout') restaurant.floorPlan = after;
      if (collection === 'categories') restaurant.menuCategories = after;
      await em.save(restaurant);
      continue;
    }
    if (after === null) { if (row) await em.remove(entity, row); continue; }
    const target: any = row || em.create(entity, { restaurantId: restaurant.id });
    switch (collection) {
      case 'menu': Object.assign(target, { clientId: key, name: after.name, nameUrdu: after.nameUrdu || null, category: after.category,
        salePrice: moneyStr(after.price), stock: after.stock, isActive: after.active, imageDataUrl: after.imageDataUrl }); break;
      case 'expenses': Object.assign(target, { clientId: key, title: after.title, category: after.category, amount: moneyStr(after.amount),
        date: after.date, notes: after.notes || null, staffId: after.staffId || null }); break;
      case 'staff': Object.assign(target, { clientId: key, name: after.name, dailyWage: moneyStr(after.dailyWage) }); break;
      case 'days': Object.assign(target, { date: key, openedAt: new Date(after.openedAt), pettyCash: moneyStr(after.pettyCash), openedBy: after.openedBy,
        closedAt: after.closedAt ? new Date(after.closedAt) : null }); break;
      case 'orders': {
        const occupied = await em.findOne(Order, { where: { restaurantId: restaurant.id, businessDate: after.date, tokenNumber: after.token } });
        if (occupied && occupied.clientId !== key) throw new ConflictException(`Token ${after.token} was used by another till. Your local order is retained.`);
        Object.assign(target, { clientId: key, tokenNumber: after.token, businessDate: after.date, type: after.type, tableId: after.tableId,
          tableNumber: after.tableId, clockTime: after.time, status: after.status, paymentMethod: after.payment || null,
          total: moneyStr(after.lines.reduce((sum: number, line: any) => sum + line.price * line.qty, 0)),
          paidAt: after.status === 'paid' ? (row?.paidAt || (after.paidAt ? new Date(after.paidAt) : new Date())) : null });
        if (!row && /^ord-\d{13}(?:-.*)?$/.test(key)) target.createdAt = new Date(Number(key.split('-')[1]));
        // Keep existing timestamps and primary IDs; replace lines only on a real line edit.
        const linesChanged = !row || stable(before?.lines) !== stable(after.lines);
        delete target.items;
        await em.save(entity, target);
        if (linesChanged) {
          await em.delete(OrderItem, { order: { id: target.id } });
          for (const line of after.lines) await em.save(OrderItem, em.create(OrderItem, { order: target,
            clientItemId: line.id, name: line.name, quantity: line.qty, unitPrice: moneyStr(line.price), lineTotal: moneyStr(line.price * line.qty) }));
        }
        restaurant.nextToken = Math.max(restaurant.nextToken, after.token + 1);
        await em.save(restaurant);
        continue;
      }
    }
    await em.save(entity, target);
  }
  return { ok: true };
}
