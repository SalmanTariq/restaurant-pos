import { closeAuth, getAuthPool, runAuthMigrations } from '../src/auth/auth';
import { createPlatformUser } from '../src/auth/create-admin';

function readArg(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(flag);
  if (index !== -1) {
    return process.argv[index + 1];
  }

  return undefined;
}

async function main() {
  const email = readArg('--email') ?? process.env.ADMIN_EMAIL;
  const password = readArg('--password') ?? process.env.ADMIN_PASSWORD;
  const name = readArg('--name') ?? process.env.ADMIN_NAME ?? 'Platform';

  if (!email || !password) {
    console.error(
      'Usage: npm run create-admin -- --email EMAIL --password PASSWORD [--name NAME]',
    );
    process.exitCode = 1;
    return;
  }

  await runAuthMigrations();

  const [existing] = await getAuthPool().query(
    'SELECT id, email FROM `user` WHERE email = ? LIMIT 1',
    [email],
  );
  const row = (existing as Array<{ id: string; email: string }>)[0];
  if (row) {
    console.log(`Platform user already exists: ${row.email} (${row.id})`);
    return;
  }

  const user = await createPlatformUser({ email, password, name });
  console.log(`Created platform user ${user.email} (${user.id})`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAuth();
  });
