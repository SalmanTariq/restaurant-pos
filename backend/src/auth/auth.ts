import { createPool, type Pool } from 'mysql2/promise';
import { httpOrigins } from '../http-origins';
import { mysqlEnv } from '../database/mysql-env';
import { loadEsm } from './load-esm';

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;

let pool: Pool | null = null;
let authPromise: Promise<AuthInstance> | null = null;

export function getAuthPool(): Pool {
  if (!pool) {
    pool = createPool({
      ...mysqlEnv(),
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

type AuthUserRow = {
  id: string;
  role: string | null;
  restaurantId: string | null;
};

type RestaurantRow = { status: string };

type SessionLike = {
  role?: string | null;
  restaurantId?: string | null;
};

export async function assertShopAccess(user: {
  role?: string | null;
  restaurantId?: string | null;
}) {
  if (user.role === 'platform') return;
  if (!user.restaurantId) {
    const { APIError } = await loadEsm<typeof import('better-auth/api')>(
      'better-auth/api',
    );
    throw new APIError('FORBIDDEN', {
      message: 'This account is not linked to a restaurant.',
    });
  }
  const [rows] = await getAuthPool().query(
    'SELECT status FROM restaurants WHERE id = ? LIMIT 1',
    [user.restaurantId],
  );
  const restaurant = (rows as RestaurantRow[])[0];
  if (!restaurant || restaurant.status === 'disabled') {
    const { APIError } = await loadEsm<typeof import('better-auth/api')>(
      'better-auth/api',
    );
    throw new APIError('FORBIDDEN', {
      message: 'This restaurant is disabled.',
    });
  }
}

async function createAuth() {
  const { betterAuth } = await loadEsm<typeof import('better-auth')>(
    'better-auth',
  );
  const { bearer, admin } = await loadEsm<
    typeof import('better-auth/plugins')
  >('better-auth/plugins');
  const { createAuthMiddleware, APIError } = await loadEsm<
    typeof import('better-auth/api')
  >('better-auth/api');

  return betterAuth({
    database: getAuthPool(),
    secret:
      process.env.BETTER_AUTH_SECRET ??
      'dev-secret-must-be-at-least-32-chars!!',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: true,
    },
    user: {
      additionalFields: {
        restaurantId: {
          type: 'string',
          required: false,
          input: false,
          fieldName: 'restaurantId',
        },
      },
    },
    plugins: [
      bearer(),
      admin({
        defaultRole: 'cashier',
        adminRoles: ['admin'],
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const [rows] = await getAuthPool().query(
              'SELECT id, role, restaurantId FROM `user` WHERE id = ? LIMIT 1',
              [session.userId],
            );
            const user = (rows as AuthUserRow[])[0];
            if (user) {
              await assertShopAccess(user);
            }
            return { data: session };
          },
          after: async (session) => {
            const [rows] = await getAuthPool().query(
              'SELECT role, restaurantId FROM `user` WHERE id = ? LIMIT 1',
              [session.userId],
            );
            const user = (rows as AuthUserRow[])[0];
            if (user?.restaurantId && user.role !== 'platform') {
              await getAuthPool().query(
                'UPDATE restaurants SET lastLoginAt = NOW() WHERE id = ?',
                [user.restaurantId],
              );
            }
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            const role = (user as { role?: string }).role;
            if (role === 'platform') {
              return { data: { ...user, restaurantId: null } };
            }
            return { data: user };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/admin/list-users') {
          throw new APIError('FORBIDDEN', {
            message: 'List users from /staff or the control panel.',
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const sessionUser = (
          ctx.context.session as { user?: SessionLike } | undefined
        )?.user;
        if (
          (ctx.path === '/get-session' || ctx.path === '/session') &&
          sessionUser
        ) {
          await assertShopAccess(sessionUser);
        }
        if (ctx.path !== '/admin/create-user') return;
        const creator = ctx.context.session?.user as
          | { restaurantId?: string | null }
          | undefined;
        const returned = ctx.context.returned as
          | { user?: { id: string } }
          | undefined;
        if (creator?.restaurantId && returned?.user?.id) {
          await getAuthPool().query(
            'UPDATE `user` SET restaurantId = ? WHERE id = ?',
            [creator.restaurantId, returned.user.id],
          );
        }
      }),
    },
    logger: {
      disabled: process.env.NODE_ENV === 'test',
    },
    trustedOrigins: httpOrigins(),
  });
}

export function getAuth() {
  if (!authPromise) {
    authPromise = createAuth();
  }
  return authPromise;
}

export async function runAuthMigrations() {
  const auth = await getAuth();
  const { getMigrations } = await loadEsm<
    typeof import('better-auth/db/migration')
  >('better-auth/db/migration');
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

export async function closeAuth() {
  authPromise = null;
  if (pool) {
    await pool.end();
    pool = null;
  }
}
