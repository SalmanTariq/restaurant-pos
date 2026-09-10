import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import Database = require('better-sqlite3');
import { loadEsm } from './load-esm';

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;

let sqlite: Database.Database | null = null;
let authPromise: Promise<AuthInstance> | null = null;

function databasePath() {
  return process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'pos.sqlite');
}

async function createAuth() {
  const { betterAuth } = await loadEsm<typeof import('better-auth')>(
    'better-auth',
  );
  const { bearer, admin } = await loadEsm<
    typeof import('better-auth/plugins')
  >('better-auth/plugins');
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');

  return betterAuth({
    database: sqlite,
    secret:
      process.env.BETTER_AUTH_SECRET ??
      'dev-secret-must-be-at-least-32-chars!!',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: true,
    },
    plugins: [
      bearer(),
      admin({
        defaultRole: 'cashier',
        adminRoles: ['admin'],
      }),
    ],
    logger: {
      disabled: process.env.NODE_ENV === 'test',
    },
    trustedOrigins: [
      'http://localhost:1420',
      'http://tauri.localhost',
      'https://tauri.localhost',
      'tauri://localhost',
    ],
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

export function closeAuth() {
  sqlite?.close();
  sqlite = null;
  authPromise = null;
}
