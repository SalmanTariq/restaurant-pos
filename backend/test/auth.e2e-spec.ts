import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { createAdminUser } from './../src/auth/create-admin';

describe('Password authentication (e2e)', () => {
  let app: INestApplication;
  const admin = {
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
    const columns = (await dataSource.query(`PRAGMA table_info(user)`)) as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toContain('role');
  });

  it('rejects public sign-up', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send(cashier)
      .expect(400);
  });

  it('creates an admin user from provided credentials', async () => {
    const user = await createAdminUser(admin);

    expect(user.email).toBe(admin.email);
    expect(user.name).toBe(admin.name);
    expect(user.role).toBe('admin');
  });

  it('rejects sign-in with the wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: admin.email, password: 'wrong-password' })
      .expect(401);
  });

  it('signs in an admin with email and password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    expect(res.body.user.email).toBe(admin.email);
    expect(res.body.user.role).toBe('admin');
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
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', signIn.headers['set-cookie'] ?? [])
      .expect(200);

    expect(res.body.user.email).toBe(admin.email);
    expect(res.body.user.role).toBe('admin');
  });

  it('authenticates /me with a bearer token from sign-in', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    const token = signIn.headers['set-auth-token'];
    expect(token).toEqual(expect.any(String));

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.user.email).toBe(admin.email);
  });

  it('lets an admin list users', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/auth/admin/list-users')
      .query({ limit: 50 })
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .expect(200);

    expect(res.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: admin.email, role: 'admin' }),
      ]),
    );
  });

  it('lets an admin create a cashier', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/auth/admin/create-user')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send(cashier)
      .expect(200);

    expect(res.body.user.email).toBe(cashier.email);
    expect(res.body.user.role).toBe('cashier');
  });

  it('does not let a cashier create users', async () => {
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: cashier.email, password: cashier.password })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/admin/create-user')
      .set('Authorization', `Bearer ${signIn.headers['set-auth-token']}`)
      .send({
        name: 'Other',
        email: 'other@example.com',
        password: 'otherpass1',
      })
      .expect(403);
  });
});
