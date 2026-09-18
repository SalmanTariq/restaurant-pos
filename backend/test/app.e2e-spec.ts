import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

const REQUIRED_TABLES = [
  'restaurants',
  'menu_items',
  'dining_tables',
  'orders',
  'order_items',
  'expenses',
  'wage_staff',
  'business_days',
] as const;

const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], string[]> = {
  restaurants: ['id', 'name', 'status', 'lastLoginAt', 'nextToken', 'floorPlan'],
  menu_items: [
    'id',
    'restaurantId',
    'clientId',
    'stock',
    'name',
    'category',
    'salePrice',
    'isActive',
  ],
  dining_tables: ['id', 'restaurantId', 'tableNumber', 'isActive'],
  orders: [
    'id',
    'restaurantId',
    'clientId',
    'tokenNumber',
    'businessDate',
    'type',
    'tableId',
    'tableNumber',
    'status',
    'paymentMethod',
    'total',
    'paidAt',
    'cancelledAt',
  ],
  order_items: ['id', 'name', 'clientItemId', 'quantity', 'unitPrice', 'lineTotal'],
  expenses: [
    'id',
    'restaurantId',
    'clientId',
    'title',
    'category',
    'amount',
    'date',
    'notes',
    'staffId',
  ],
  wage_staff: ['id', 'restaurantId', 'clientId', 'name', 'dailyWage'],
  business_days: [
    'id',
    'restaurantId',
    'date',
    'openedAt',
    'pettyCash',
    'openedBy',
  ],
};

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.database).toBe('mysql');
        expect(res.body.mysqlVersion).toEqual(expect.any(String));
      });
  });
});

describe('POS schema (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates the POS tables from the spec', async () => {
    const rows = (await dataSource.query(
      `SELECT TABLE_NAME AS name
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()`,
    )) as Array<{ name: string }>;
    const names = rows.map((row) => row.name);

    for (const table of REQUIRED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it.each(REQUIRED_TABLES)('has the required columns on %s', async (table) => {
    const columns = (await dataSource.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    )) as Array<{ name: string }>;
    const names = columns.map((column) => column.name);

    for (const column of REQUIRED_COLUMNS[table]) {
      expect(names).toContain(column);
    }
  });
});
