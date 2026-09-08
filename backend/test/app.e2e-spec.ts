import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

const REQUIRED_TABLES = [
  'menu_items',
  'dining_tables',
  'orders',
  'order_items',
  'expenses',
] as const;

const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], string[]> = {
  menu_items: ['id', 'name', 'category', 'salePrice', 'isActive'],
  dining_tables: ['id', 'tableNumber', 'isActive'],
  orders: [
    'id',
    'tokenNumber',
    'businessDate',
    'type',
    'tableNumber',
    'status',
    'paymentMethod',
    'total',
    'paidAt',
    'cancelledAt',
  ],
  order_items: ['id', 'name', 'quantity', 'unitPrice', 'lineTotal'],
  expenses: ['id', 'title', 'category', 'amount', 'date', 'notes'],
};

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.DATABASE_PATH = join(__dirname, '..', 'data', 'test.sqlite');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterEach(async () => {
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
        expect(res.body.database).toBe('sqlite');
        expect(res.body.sqliteVersion).toEqual(expect.any(String));
      });
  });
});

describe('POS schema (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.DATABASE_PATH = join(__dirname, '..', 'data', 'test.sqlite');

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
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    )) as Array<{ name: string }>;
    const names = rows.map((row) => row.name);

    for (const table of REQUIRED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it.each(REQUIRED_TABLES)('has the required columns on %s', async (table) => {
    const columns = (await dataSource.query(
      `PRAGMA table_info(${table})`,
    )) as Array<{ name: string }>;
    const names = columns.map((column) => column.name);

    for (const column of REQUIRED_COLUMNS[table]) {
      expect(names).toContain(column);
    }
  });
});
