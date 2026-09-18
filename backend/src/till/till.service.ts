import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessDay } from '../database/entities/business-day.entity';
import { DiningTable } from '../database/entities/dining-table.entity';
import { Expense } from '../database/entities/expense.entity';
import { MenuItem } from '../database/entities/menu-item.entity';
import { Order, OrderItem } from '../database/entities/order.entity';
import { OrderStatus, OrderType, PaymentMethod } from '../database/entities/enums';
import { Restaurant } from '../database/entities/restaurant.entity';
import { WageStaff } from '../database/entities/wage-staff.entity';
import { DEFAULT_FLOOR, DEFAULT_MENU } from './default-catalog';

export type TillMenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
};

export type TillLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type TillOrder = {
  id: string;
  token: number;
  type: 'takeaway' | 'dine-in';
  tableId: string | null;
  lines: TillLine[];
  status: 'open' | 'billed' | 'paid';
  date: string;
  time: string;
  payment?: 'cash' | 'online';
};

export type TillExpense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  notes: string;
  staffId?: string;
};

export type TillStaff = {
  id: string;
  name: string;
  dailyWage: number;
};

export type TillDay = {
  date: string;
  openedAt: string;
  pettyCash: number;
  openedBy: string;
};

export type TillSettings = {
  restaurantName: string;
  logoDataUrl: string | null;
  requirePettyCash: boolean;
  useInventory: boolean;
};

export type TillLayout = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'round' | 'rect';
  kind?: 'table' | 'counter';
};

export type TillSnapshot = {
  menu: TillMenuItem[];
  orders: TillOrder[];
  nextToken: number;
  expenses: TillExpense[];
  staff: TillStaff[];
  days: TillDay[];
  settings: TillSettings;
  layout: TillLayout[];
};

const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function moneyStr(value: number) {
  return value.toFixed(2);
}

function asDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

@Injectable()
export class TillService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Restaurant)
    private readonly restaurants: Repository<Restaurant>,
    @InjectRepository(MenuItem)
    private readonly menu: Repository<MenuItem>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    @InjectRepository(Expense)
    private readonly expenses: Repository<Expense>,
    @InjectRepository(WageStaff)
    private readonly staff: Repository<WageStaff>,
    @InjectRepository(BusinessDay)
    private readonly days: Repository<BusinessDay>,
    @InjectRepository(DiningTable)
    private readonly tables: Repository<DiningTable>,
  ) {}

  async get(restaurantId: string): Promise<TillSnapshot> {
    const restaurant = await this.requireRestaurant(restaurantId);
    let menu = await this.menu.find({
      where: { restaurantId },
      order: { id: 'ASC' },
    });
    if (menu.length === 0) {
      await this.seed(restaurant);
      return this.get(restaurantId);
    }

    const [orders, expenses, staff, days] = await Promise.all([
      this.orders.find({
        where: { restaurantId },
        relations: ['items'],
        order: { tokenNumber: 'DESC' },
      }),
      this.expenses.find({
        where: { restaurantId },
        order: { id: 'DESC' },
      }),
      this.staff.find({
        where: { restaurantId },
        order: { id: 'ASC' },
      }),
      this.days.find({
        where: { restaurantId },
        order: { date: 'DESC' },
      }),
    ]);

    return {
      menu: menu.map((item) => ({
        id: item.clientId,
        name: item.name,
        category: item.category,
        price: money(item.salePrice),
        stock: item.stock,
        active: item.isActive,
      })),
      orders: orders.map((order) => this.toOrder(order)),
      nextToken: restaurant.nextToken || 1,
      expenses: expenses.map((row) => ({
        id: row.clientId,
        title: row.title,
        category: row.category,
        amount: money(row.amount),
        date: asDate(row.date),
        notes: row.notes ?? '',
        staffId: row.staffId ?? undefined,
      })),
      staff: staff.map((row) => ({
        id: row.clientId,
        name: row.name,
        dailyWage: money(row.dailyWage),
      })),
      days: days.map((row) => ({
        date: asDate(row.date),
        openedAt:
          row.openedAt instanceof Date
            ? row.openedAt.toISOString()
            : String(row.openedAt),
        pettyCash: money(row.pettyCash),
        openedBy: row.openedBy,
      })),
      settings: {
        restaurantName: restaurant.name,
        logoDataUrl: restaurant.logoDataUrl,
        requirePettyCash: restaurant.requirePettyCash !== false,
        useInventory: restaurant.useInventory !== false,
      },
      layout: this.readLayout(restaurant.floorPlan),
    };
  }

  async save(restaurantId: string, body: Partial<TillSnapshot>) {
    await this.requireRestaurant(restaurantId);
    const snapshot = this.normalize(body);
    await this.dataSource.transaction(async (em) => {
      const restaurant = await em.findOneByOrFail(Restaurant, {
        id: restaurantId,
      });
      restaurant.name = snapshot.settings.restaurantName;
      restaurant.logoDataUrl = snapshot.settings.logoDataUrl;
      restaurant.requirePettyCash = snapshot.settings.requirePettyCash;
      restaurant.useInventory = snapshot.settings.useInventory;
      restaurant.nextToken = snapshot.nextToken;
      restaurant.floorPlan = snapshot.layout;
      await em.save(restaurant);

      await em.query(
        'DELETE oi FROM order_items oi INNER JOIN orders o ON oi.orderId = o.id WHERE o.restaurantId = ?',
        [restaurantId],
      );
      await em.delete(Order, { restaurantId });
      await em.delete(MenuItem, { restaurantId });
      await em.delete(Expense, { restaurantId });
      await em.delete(WageStaff, { restaurantId });
      await em.delete(BusinessDay, { restaurantId });
      await em.delete(DiningTable, { restaurantId });

      await em.save(
        MenuItem,
        snapshot.menu.map((item) =>
          em.create(MenuItem, {
            restaurantId,
            clientId: item.id,
            name: item.name,
            category: item.category,
            salePrice: moneyStr(item.price),
            stock: item.stock,
            isActive: item.active,
          }),
        ),
      );

      for (const order of snapshot.orders) {
        const total = order.lines.reduce(
          (sum, line) => sum + line.price * line.qty,
          0,
        );
        const row = em.create(Order, {
            restaurantId,
            clientId: order.id,
            tokenNumber: order.token,
            businessDate: order.date,
            type: order.type as OrderType,
            tableId: order.tableId,
            tableNumber: order.tableId,
            clockTime: order.time,
            status: order.status as OrderStatus,
            paymentMethod: (order.payment ?? null) as PaymentMethod | null,
            total: moneyStr(total),
            paidAt: order.status === 'paid' ? new Date() : null,
          });
        const saved = await em.save(row);
        if (order.lines.length > 0) {
          await em.save(
            OrderItem,
            order.lines.map((line) =>
              em.create(OrderItem, {
                order: saved,
                clientItemId: line.id,
                name: line.name,
                quantity: line.qty,
                unitPrice: moneyStr(line.price),
                lineTotal: moneyStr(line.price * line.qty),
              }),
            ),
          );
        }
      }

      if (snapshot.expenses.length > 0) {
        await em.save(
          Expense,
          snapshot.expenses.map((row) =>
            em.create(Expense, {
              restaurantId,
              clientId: row.id,
              title: row.title,
              category: row.category,
              amount: moneyStr(row.amount),
              date: row.date,
              notes: row.notes || null,
              staffId: row.staffId ?? null,
            }),
          ),
        );
      }

      if (snapshot.staff.length > 0) {
        await em.save(
          WageStaff,
          snapshot.staff.map((row) =>
            em.create(WageStaff, {
              restaurantId,
              clientId: row.id,
              name: row.name,
              dailyWage: moneyStr(row.dailyWage),
            }),
          ),
        );
      }

      if (snapshot.days.length > 0) {
        await em.save(
          BusinessDay,
          snapshot.days.map((row) =>
            em.create(BusinessDay, {
              restaurantId,
              date: row.date,
              openedAt: new Date(row.openedAt),
              pettyCash: moneyStr(row.pettyCash),
              openedBy: row.openedBy,
            }),
          ),
        );
      }

      const tablePieces = snapshot.layout.filter(
        (piece) => piece.kind !== 'counter',
      );
      if (tablePieces.length > 0) {
        await em.save(
          DiningTable,
          tablePieces.map((piece) =>
            em.create(DiningTable, {
              restaurantId,
              tableNumber: piece.id,
              isActive: true,
            }),
          ),
        );
      }
    });

    return this.get(restaurantId);
  }

  private async seed(restaurant: Restaurant) {
    await this.menu.save(
      DEFAULT_MENU.map((item) =>
        this.menu.create({
          restaurantId: restaurant.id,
          clientId: item.id,
          name: item.name,
          category: item.category,
          salePrice: moneyStr(item.price),
          stock: 0,
          isActive: true,
        }),
      ),
    );
    restaurant.floorPlan = DEFAULT_FLOOR;
    if (!restaurant.nextToken) restaurant.nextToken = 1;
    await this.restaurants.save(restaurant);
    await this.tables.save(
      DEFAULT_FLOOR.filter((piece) => piece.kind !== 'counter').map((piece) =>
        this.tables.create({
          restaurantId: restaurant.id,
          tableNumber: piece.id,
          isActive: true,
        }),
      ),
    );
  }

  private async requireRestaurant(restaurantId: string) {
    const restaurant = await this.restaurants.findOne({
      where: { id: restaurantId },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found.');
    return restaurant;
  }

  private toOrder(order: Order): TillOrder {
    const type = order.type === 'dine-in' ? 'dine-in' : 'takeaway';
    const status =
      order.status === 'billed' || order.status === 'paid'
        ? order.status
        : 'open';
    const payment =
      order.paymentMethod === 'online' || order.paymentMethod === 'cash'
        ? order.paymentMethod
        : undefined;
    return {
      id: order.clientId,
      token: order.tokenNumber,
      type,
      tableId: order.tableId ?? order.tableNumber,
      date: asDate(order.businessDate),
      time: order.clockTime || '',
      status,
      payment,
      lines: (order.items ?? []).map((line) => ({
        id: line.clientItemId || '',
        name: line.name,
        price: money(line.unitPrice),
        qty: line.quantity,
      })),
    };
  }

  private readLayout(value: unknown): TillLayout[] {
    if (!Array.isArray(value) || value.length === 0) return DEFAULT_FLOOR;
    const pieces = value
      .map((entry) => this.asLayout(entry))
      .filter((piece): piece is TillLayout => piece !== null);
    return pieces.length > 0 ? pieces : DEFAULT_FLOOR;
  }

  private asLayout(value: unknown): TillLayout | null {
    if (!value || typeof value !== 'object') return null;
    const entry = value as TillLayout;
    if (typeof entry.id !== 'string' || !entry.id) return null;
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      id: entry.id,
      x,
      y,
      w: Number(entry.w) || 128,
      h: Number(entry.h) || 128,
      shape: entry.shape === 'rect' ? 'rect' : 'round',
      kind: entry.kind === 'counter' ? 'counter' : 'table',
    };
  }

  private normalize(body: Partial<TillSnapshot>): TillSnapshot {
    if (!Array.isArray(body.menu)) {
      throw new BadRequestException('Menu is required.');
    }
    const restaurantName =
      typeof body.settings?.restaurantName === 'string' &&
      body.settings.restaurantName.trim()
        ? body.settings.restaurantName.trim()
        : 'Restaurant';
    const logo = body.settings?.logoDataUrl ?? null;
    return {
      menu: body.menu.map((item, index) => ({
        id: String(item?.id || `item-${index}`),
        name: String(item?.name || 'Item').trim() || 'Item',
        category: String(item?.category || 'Other'),
        price: Math.max(0, money(item?.price)),
        stock: Math.max(0, Math.floor(money(item?.stock))),
        active: item?.active !== false,
      })),
      orders: Array.isArray(body.orders)
        ? body.orders.map((order, index) => this.normalizeOrder(order, index))
        : [],
      nextToken: Math.max(1, Math.floor(money(body.nextToken) || 1)),
      expenses: Array.isArray(body.expenses)
        ? body.expenses.map((row, index) => ({
            id: String(row?.id || `exp-${index}`),
            title: String(row?.title || 'Expense').trim() || 'Expense',
            category: String(row?.category || 'Other'),
            amount: Math.max(0, money(row?.amount)),
            date: String(row?.date || '').slice(0, 10),
            notes: String(row?.notes || ''),
            staffId: row?.staffId ? String(row.staffId) : undefined,
          }))
        : [],
      staff: Array.isArray(body.staff)
        ? body.staff.map((row, index) => ({
            id: String(row?.id || `staff-${index}`),
            name: String(row?.name || 'Staff').trim() || 'Staff',
            dailyWage: Math.max(0, money(row?.dailyWage)),
          }))
        : [],
      days: Array.isArray(body.days)
        ? body.days.map((row) => ({
            date: String(row?.date || '').slice(0, 10),
            openedAt: String(row?.openedAt || new Date().toISOString()),
            pettyCash: Math.max(0, money(row?.pettyCash)),
            openedBy: String(row?.openedBy || 'Staff'),
          }))
        : [],
      settings: {
        restaurantName,
        logoDataUrl: typeof logo === 'string' && LOGO_PATTERN.test(logo) ? logo : null,
        requirePettyCash: body.settings?.requirePettyCash !== false,
        useInventory: body.settings?.useInventory !== false,
      },
      layout: this.readLayout(body.layout),
    };
  }

  private normalizeOrder(order: TillOrder, index: number): TillOrder {
    const payment =
      order?.payment === 'online' || order?.payment === 'cash'
        ? order.payment
        : undefined;
    const status =
      order?.status === 'billed' || order?.status === 'paid' ? order.status : 'open';
    return {
      id: String(order?.id || `ord-${index}`),
      token: Math.max(1, Math.floor(money(order?.token) || index + 1)),
      type: order?.type === 'dine-in' ? 'dine-in' : 'takeaway',
      tableId: order?.tableId ? String(order.tableId) : null,
      date: String(order?.date || '').slice(0, 10),
      time: String(order?.time || ''),
      status,
      payment,
      lines: Array.isArray(order?.lines)
        ? order.lines.map((line) => ({
            id: String(line?.id || ''),
            name: String(line?.name || 'Item'),
            price: Math.max(0, money(line?.price)),
            qty: Math.max(1, Math.floor(money(line?.qty) || 1)),
          }))
        : [],
    };
  }
}
