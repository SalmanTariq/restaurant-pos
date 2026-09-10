import { closeAuth, runAuthMigrations } from '../src/auth/auth';
import { createAdminUser } from '../src/auth/create-admin';

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
  const name = readArg('--name') ?? process.env.ADMIN_NAME ?? 'Admin';

  if (!email || !password) {
    console.error(
      'Usage: npm run create-admin -- --email EMAIL --password PASSWORD [--name NAME]',
    );
    process.exitCode = 1;
    return;
  }

  await runAuthMigrations();
  const user = await createAdminUser({ email, password, name });
  console.log(`Created admin ${user.email} (${user.id})`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => {
    closeAuth();
  });
