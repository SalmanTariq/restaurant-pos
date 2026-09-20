import { runAuthMigrations, closeAuth } from '../src/auth/auth';
import dataSource from '../src/database/data-source';

async function main() {
  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    if (!pending) {
      console.log('POS schema is up to date.');
    } else {
      const ran = await dataSource.runMigrations();
      if (ran.length === 0) {
        console.log('POS schema is up to date.');
      } else {
        console.log(
          `Applied POS migrations: ${ran.map((row) => row.name).join(', ')}`,
        );
      }
    }
  } finally {
    await dataSource.destroy();
  }

  await runAuthMigrations();
  console.log('Auth schema is up to date.');
  await closeAuth();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
