import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { createPlatformUser } from './../src/auth/create-admin';

describe('Password authentication (e2e)', () => {
  let app: INestApplication;
  const platform = {
    name: 'Platform',
    email: 'platform@example.com',
    password: 'password1234',
  };
  const owner = {
    name: 'Owner',
    email: 'owner@example.com',
    password: 'password1234',
  };
  const cashier = {
    name: 'Cashier',
    email: 'cashier@example.com',
    password: 'cashierpass1',
  };

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

  it('adds a role column for user management', async () => {
    const dataSource = app.get(DataSource);
    const columns = (await dataSource.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'`,
    )) as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['role', 'restaurantId']),
    );
  });

  it('rejects public sign-up', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send(cashier)
      .expect(400);
  });

  it('creates a platform user from provided credentials', async () => {
    const user = await createPlatformUser(platform);

    expect(user.email).toBe(platform.email);
    expect(user.name).toBe(platform.name);
    expect(user.role).toBe('platform');
  });

  it('rejects sign-in with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: 'wrong-password' })
      .expect(401);
  });

  it('signs in a platform user with email and password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    expect(res.body.user.email).toBe(platform.email);
    expect(res.body.user.role).toBe('platform');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('better-auth.session_token'),
      ]),
    );
  });

  it('rejects unauthenticated access to /me', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('returns the current user role on /me when signed in', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', signIn.headers['set-cookie'] ?? [])
      .expect(200);

    expect(res.body.user.email).toBe(platform.email);
    expect(res.body.user.role).toBe('platform');
    expect(res.body.user.restaurantId).toBeNull();
  });

  it('authenticates /me with a bearer token from sign-in', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const token = signIn.headers['set-auth-token'];
    expect(token).toEqual(expect.any(String));

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.user.email).toBe(platform.email);
  });

  it('lets a platform user create a restaurant and owner', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/platform/restaurants')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send({
        name: 'Test Kitchen',
        ownerName: owner.name,
        ownerEmail: owner.email,
        ownerPassword: owner.password,
      })
      .expect(201);

    expect(res.body.name).toBe('Test Kitchen');
    expect(res.body.status).toBe('active');
    expect(res.body.ownerEmail).toBe(owner.email);
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('lists restaurants in the control panel', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/platform/restaurants')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .expect(200);

    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Test Kitchen',
          ownerEmail: owner.email,
          status: 'active',
        }),
      ]),
    );
  });

  it('does not let a shop admin list all users', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/admin/list-users')
      .query({ limit: 50 })
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .expect(403);
  });

  it('lets a shop admin list staff in their restaurant', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .expect(200);

    expect(res.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: owner.email, role: 'admin' }),
      ]),
    );
    expect(res.body.users).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: platform.email }),
      ]),
    );
  });

  it('lets a shop admin create a cashier', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send(cashier)
      .expect(201);

    expect(res.body.email).toBe(cashier.email);
    expect(res.body.role).toBe('cashier');
  });

  it('does not let a cashier create users', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: cashier.email, password: cashier.password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send({
        name: 'Other',
        email: 'other@example.com',
        password: 'otherpass1',
      })
      .expect(403);
  });

  it('blocks shop sign-in after the restaurant is disabled', async () => {
    const platformSignIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const shops = await request(app.getHttpServer())
      .get('/platform/restaurants')
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .expect(200);

    const shopId = shops.body[0].id as string;

    await request(app.getHttpServer())
      .patch(`/platform/restaurants/${shopId}`)
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .send({ status: 'disabled' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/platform/restaurants/${shopId}`)
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .send({ status: 'active' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);
  });

  it('lets a platform user reset a restaurant owner password', async () => {
    const platformSignIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const shops = await request(app.getHttpServer())
      .get('/platform/restaurants')
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .expect(200);

    const shopId = shops.body.find(
      (shop: { ownerEmail: string }) => shop.ownerEmail === owner.email,
    ).id as string;

    await request(app.getHttpServer())
      .post(`/platform/restaurants/${shopId}/password`)
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .send({ password: 'newpass1234' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: 'newpass1234' })
      .expect(200);

    owner.password = 'newpass1234';
  });

  it('lets a platform user clear sales without touching the menu', async () => {
    const platformSignIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    const shops = await request(app.getHttpServer())
      .get('/platform/restaurants')
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .expect(200);

    const shopId = shops.body.find(
      (shop: { ownerEmail: string }) => shop.ownerEmail === owner.email,
    ).id as string;

    const ownerSignIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);

    const empty = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${ownerSignIn.headers['set-auth-token']}`)
      .expect(200);

    await request(app.getHttpServer())
      .put('/till')
      .set('Authorization', `Bearer ${ownerSignIn.headers['set-auth-token']}`)
      .send({
        ...empty.body,
        nextToken: 9,
        orders: [
          {
            id: 'ord-clear-me',
            token: 8,
            type: 'takeaway',
            tableId: null,
            status: 'paid',
            payment: 'cash',
            date: '2026-09-11',
            time: '1:00 PM',
            lines: [{ id: 'roti', name: 'Roti', price: 25, qty: 2 }],
          },
        ],
        days: [
          {
            date: '2026-09-11',
            openedAt: '2026-09-11T08:00:00.000Z',
            pettyCash: 2000,
            openedBy: 'Owner',
          },
        ],
        menu: [
          {
            id: 'roti',
            name: 'Roti',
            category: 'Breads',
            price: 25,
            stock: 40,
            active: true,
          },
        ],
      })
      .expect(200);

    const cleared = await request(app.getHttpServer())
      .post(`/platform/restaurants/${shopId}/clear-sales`)
      .set('Authorization', `Bearer ${platformSignIn.headers['set-auth-token']}`)
      .expect(200);

    expect(cleared.body).toMatchObject({
      ok: true,
      clearedOrders: 1,
      clearedDays: 1,
      nextToken: 1,
    });

    const after = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${ownerSignIn.headers['set-auth-token']}`)
      .expect(200);

    expect(after.body.orders).toEqual([]);
    expect(after.body.days).toEqual([]);
    expect(after.body.nextToken).toBe(1);
    expect(after.body.menu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'roti', stock: 40 }),
      ]),
    );
  });

  it('does not let a shop admin reset passwords from the control panel', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: owner.email, password: owner.password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/platform/restaurants/any-id/password')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send({ password: 'anotherpass1' })
      .expect(403);
  });

  it('rejects unauthenticated till access', async () => {
    await request(app.getHttpServer()).get('/till').expect(401);
  });

  it('rejects platform access to a shop till', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: platform.email, password: platform.password })
      .expect(200);

    await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .expect(403);
  });

  it('seeds a shop till and keeps orders in MySQL per restaurant', async () => {
    const platformToken = (
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: platform.email, password: platform.password })
        .expect(200)
    ).headers['set-auth-token'] as string;

    await request(app.getHttpServer())
      .post('/platform/restaurants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: 'Second Kitchen',
        ownerName: 'Other',
        ownerEmail: 'other-till@example.com',
        ownerPassword: 'password1234',
      })
      .expect(201);

    const ownerToken = (
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: owner.email, password: owner.password })
        .expect(200)
    ).headers['set-auth-token'] as string;
    const otherToken = (
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: 'other-till@example.com', password: 'password1234' })
        .expect(200)
    ).headers['set-auth-token'] as string;

    const empty = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(empty.body.settings.restaurantName).toBe('Test Kitchen');
    expect(empty.body.menu.length).toBeGreaterThan(0);
    expect(empty.body.categories).toEqual(
      expect.arrayContaining(['Karahi', 'BBQ', 'Drinks']),
    );
    expect(empty.body.orders).toEqual([]);
    expect(empty.body.nextToken).toBe(1);

    const item = empty.body.menu[0];
    await request(app.getHttpServer())
      .put('/till')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...empty.body,
        nextToken: 2,
        menu: empty.body.menu.map((entry: { id: string }) =>
          entry.id === item.id ? { ...entry, stock: 8 } : entry,
        ),
        orders: [
          {
            id: 'ord-1',
            token: 1,
            type: 'takeaway',
            tableId: null,
            date: '2026-09-11',
            time: '1:00 PM',
            status: 'paid',
            payment: 'cash',
            lines: [
              {
                id: item.id,
                name: item.name,
                price: item.price,
                qty: 1,
              },
            ],
          },
        ],
        expenses: [
          {
            id: 'exp-1',
            title: 'Gas',
            category: 'Utilities',
            amount: 500,
            date: '2026-09-11',
            notes: '',
          },
        ],
        staff: [{ id: 'staff-1', name: 'Ali', dailyWage: 1200 }],
        days: [
          {
            date: '2026-09-11',
            openedAt: '2026-09-11T08:00:00.000Z',
            pettyCash: 2000,
            openedBy: 'Owner',
          },
        ],
        settings: {
          ...empty.body.settings,
          requirePettyCash: false,
        },
      })
      .expect(200);

    const saved = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(saved.body.nextToken).toBe(2);
    expect(saved.body.orders).toEqual([
      expect.objectContaining({ id: 'ord-1', token: 1, status: 'paid' }),
    ]);
    expect(
      saved.body.menu.find((entry: { id: string }) => entry.id === item.id).stock,
    ).toBe(8);
    expect(saved.body.settings.requirePettyCash).toBe(false);

    const otherTill = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(otherTill.body.settings.restaurantName).toBe('Second Kitchen');
    expect(otherTill.body.orders).toEqual([]);
  });

  it('lets a cashier read and write the same shop till', async () => {
    const cashierToken = (
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: cashier.email, password: cashier.password })
        .expect(200)
    ).headers['set-auth-token'] as string;

    const till = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put('/till')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        ...till.body,
        nextToken: till.body.nextToken + 1,
        orders: [
          ...till.body.orders,
          {
            id: 'ord-cashier',
            token: till.body.nextToken,
            type: 'dine-in',
            tableId: 'T1',
            date: '2026-09-11',
            time: '2:00 PM',
            status: 'open',
            lines: [],
          },
        ],
      })
      .expect(200);

    const ownerToken = (
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: owner.email, password: owner.password })
        .expect(200)
    ).headers['set-auth-token'] as string;

    const saved = await request(app.getHttpServer())
      .get('/till')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(saved.body.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ord-cashier', type: 'dine-in' }),
      ]),
    );
  });
});
