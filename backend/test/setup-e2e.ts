import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_PATH = join(__dirname, '..', 'data', 'test.sqlite');
process.env.BETTER_AUTH_SECRET = 'test-secret-must-be-at-least-32-chars!!';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000';

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${process.env.DATABASE_PATH}${suffix}`, { force: true });
}
