import { Injectable, NotFoundException } from '@nestjs/common';
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
import { mergeMenuCategories } from './menu-categories';
import {
  asDate,
  money,
  moneyStr,
  normalizeTillSnapshot,
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
      })),
      settings: {
        restaurantName: restaurant.name,
        logoDataUrl: restaurant.logoDataUrl,
        requirePettyCash: restaurant.requirePettyCash !== false,
        useInventory: restaurant.useInventory !== false,
      },
      layout: readLayout(restaurant.floorPlan),
      categories: mergeMenuCategories(
        restaurant.menuCategories,
        menu.map((item) => item.category),
      ),
    };
  }

  async save(restaurantId: string, body: Partial<TillSnapshot>) {
    await this.requireRestaurant(restaurantId);
    const snapshot = normalizeTillSnapshot(body);
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
      restaurant.menuCategories = snapshot.categories;
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
            nameUrdu: item.nameUrdu || null,
            category: item.category,
            salePrice: moneyStr(item.price),
            stock: item.stock,
            isActive: item.active,
            imageDataUrl: item.imageDataUrl,
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
      lines: (order.items ?? []).map((line) => ({
        id: line.clientItemId || '',
        name: line.name,
        price: money(line.unitPrice),
        qty: line.quantity,
      })),
    };
  }
}
