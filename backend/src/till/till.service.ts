import { applyTillChanges } from './till-incremental';
import type { TillPatch } from './till-patch';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessDay } from '../database/entities/business-day.entity';
import { DiningTable } from '../database/entities/dining-table.entity';
import { Expense } from '../database/entities/expense.entity';
import { MenuItem } from '../database/entities/menu-item.entity';
import { Order } from '../database/entities/order.entity';
import { Restaurant } from '../database/entities/restaurant.entity';
import { WageStaff } from '../database/entities/wage-staff.entity';
import { DEFAULT_FLOOR, DEFAULT_MENU } from './default-catalog';
import { mergeMenuCategories } from './menu-categories';
import {
  asDate,
  money,
  moneyStr,
  readLayout,
  type TillOrder,
  type TillSnapshot,
} from './till-snapshot';

export type {
  TillDay,
  TillExpense,
  TillLayout,
  TillLine,
  TillMenuItem,
  TillOrder,
  TillSettings,
  TillSnapshot,
  TillStaff,
} from './till-snapshot';

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
    if (menu.length === 0 && restaurant.nextToken <= 1) {
      const orderCount = await this.orders.count({ where: { restaurantId } });
      if (orderCount === 0) {
        await this.seed(restaurant);
        return this.get(restaurantId);
      }
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
        nameUrdu: item.nameUrdu ?? '',
        category: item.category,
        price: money(item.salePrice),
        stock: item.stock,
        active: item.isActive,
        imageDataUrl: item.imageDataUrl,
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
        closedAt: row.closedAt
          ? row.closedAt instanceof Date
            ? row.closedAt.toISOString()
            : String(row.closedAt)
          : null,
      })),
      settings: {
        restaurantName: restaurant.name,
        logoDataUrl: restaurant.logoDataUrl,
        requirePettyCash: restaurant.requirePettyCash !== false,
        useInventory: restaurant.useInventory !== false,
        useTables: restaurant.useTables !== false,
      },
      layout: readLayout(restaurant.floorPlan),
      categories: mergeMenuCategories(
        restaurant.menuCategories,
        menu.map((item) => item.category),
      ),
    };
  }

  async save(_restaurantId: string, _body: Partial<TillSnapshot>) {
    throw new ConflictException('This till version uses unsafe full-snapshot saves. Reload the app to update before syncing.');
  }

  async sync(restaurantId: string, patch: TillPatch) {
    return this.dataSource.transaction(async (em) => {
      // Serializes writers for this restaurant; comparisons and writes are atomic.
      const restaurant = await em.findOne(Restaurant, {
        where: { id: restaurantId }, lock: { mode: 'pessimistic_write' },
      });
      if (!restaurant) throw new NotFoundException('Restaurant not found.');
      return applyTillChanges(em, restaurant, patch);
    });
  }

  private async seed(restaurant: Restaurant) {
    // Only used for a brand-new shop with no tickets yet. Never run from deploy.
    await this.menu.save(
      DEFAULT_MENU.map((item) =>
        this.menu.create({
          restaurantId: restaurant.id,
          clientId: item.id,
          name: item.name,
          nameUrdu: item.nameUrdu ?? null,
          category: item.category,
          salePrice: moneyStr(item.price),
          stock: 0,
          isActive: true,
        }),
      ),
    );
    restaurant.floorPlan = DEFAULT_FLOOR;
    restaurant.menuCategories = mergeMenuCategories(
      null,
      DEFAULT_MENU.map((item) => item.category),
    );
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
      paidAt: order.paidAt ? order.paidAt.toISOString() : undefined,
      lines: (order.items ?? []).map((line) => ({
        id: line.clientItemId || '',
        name: line.name,
        price: money(line.unitPrice),
        qty: line.quantity,
      })),
    };
  }
}
