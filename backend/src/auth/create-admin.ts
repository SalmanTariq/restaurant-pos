import { getAuth, getAuthPool } from './auth';

export type CreatePlatformInput = {
  email: string;
  password: string;
  name: string;
};

export async function createPlatformUser(input: CreatePlatformInput) {
  const auth = await getAuth();
  const result = await auth.api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
  });

  await getAuthPool().query(
    'UPDATE `user` SET role = ?, restaurantId = NULL WHERE id = ?',
    ['platform', result.user.id],
  );

  return { ...result.user, role: 'platform' as const };
}

/** @deprecated Use createPlatformUser — bootstrap account is platform, not shop admin. */
export async function createAdminUser(input: CreatePlatformInput) {
  return createPlatformUser(input);
}
