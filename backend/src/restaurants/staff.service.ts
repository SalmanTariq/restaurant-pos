import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { getAuth, getAuthPool } from '../auth/auth';

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

@Injectable()
export class StaffService {
  async list(restaurantId: string): Promise<StaffUser[]> {
    const [rows] = await getAuthPool().query(
      `SELECT id, name, email, role FROM \`user\`
       WHERE restaurantId = ?
       ORDER BY createdAt ASC`,
      [restaurantId],
    );
    return rows as StaffRow[];
  }

  async create(
    restaurantId: string,
    input: {
      name: string;
      email: string;
      password: string;
      role?: string;
    },
  ) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email =
      typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password =
      typeof input.password === 'string' ? input.password : '';
    const role = input.role === 'admin' ? 'admin' : 'cashier';

    if (!name) throw new BadRequestException('Name is required.');
    if (!email.includes('@')) {
      throw new BadRequestException('Email is required.');
    }
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    if (input.role === 'platform') {
      throw new BadRequestException('Cannot create a platform user here.');
    }

    const auth = await getAuth();
    const created = await auth.api.createUser({
      body: {
        email,
        password,
        name,
        ...(role === 'admin' ? { role: 'admin' as const } : {}),
      },
    });

    await getAuthPool().query(
      'UPDATE `user` SET restaurantId = ? WHERE id = ?',
      [restaurantId, created.user.id],
    );

    return {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role: created.user.role ?? role,
    };
  }
}
