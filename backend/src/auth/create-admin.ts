import { getAuth } from './auth';

export type CreateAdminInput = {
  email: string;
  password: string;
  name: string;
};

export async function createAdminUser(input: CreateAdminInput) {
  const auth = await getAuth();
  const result = await auth.api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: 'admin',
    },
  });

  return result.user;
}
