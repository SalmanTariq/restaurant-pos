import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getAuth, getAuthPool } from '../auth/auth';
import {
  Restaurant,
  type RestaurantStatus,
} from '../database/entities/restaurant.entity';

export type CreateRestaurantInput = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

export type RestaurantListItem = {
  id: string;
  name: string;
  status: RestaurantStatus;
  ownerEmail: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type OwnerRow = { email: string; restaurantId: string };

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurants: Repository<Restaurant>,
  ) {}

  async list(): Promise<RestaurantListItem[]> {
    const shops = await this.restaurants.find({
      order: { createdAt: 'DESC' },
    });
    const owners = await this.ownerEmails();
    return shops.map((shop) =>
      this.toItem(shop, owners.get(shop.id) ?? null),
    );
  }

  async create(input: CreateRestaurantInput): Promise<RestaurantListItem> {
    const name = trim(input.name);
    const ownerName = trim(input.ownerName);
    const ownerEmail = trim(input.ownerEmail).toLowerCase();
    const ownerPassword = typeof input.ownerPassword === 'string'
      ? input.ownerPassword
      : '';

    if (!name) throw new BadRequestException('Restaurant name is required.');
    if (!ownerName) throw new BadRequestException('Owner name is required.');
    if (!ownerEmail.includes('@')) {
      throw new BadRequestException('Owner email is required.');
    }
    if (ownerPassword.length < 8) {
      throw new BadRequestException('Owner password must be at least 8 characters.');
    }

    const restaurant = await this.restaurants.save(
      this.restaurants.create({ name, status: 'active' }),
    );

    try {
      const auth = await getAuth();
      const created = await auth.api.createUser({
        body: {
          email: ownerEmail,
          password: ownerPassword,
          name: ownerName,
          role: 'admin',
        },
      });
      await getAuthPool().query(
        'UPDATE `user` SET restaurantId = ? WHERE id = ?',
        [restaurant.id, created.user.id],
      );
      return this.toItem(restaurant, ownerEmail);
    } catch (error) {
      await this.restaurants.delete(restaurant.id);
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists|unique|duplicate/i.test(message)) {
        throw new ConflictException('That owner email is already in use.');
      }
      throw error;
    }
  }

  async setStatus(id: string, status: RestaurantStatus) {
    if (status !== 'active' && status !== 'disabled') {
      throw new BadRequestException('Status must be active or disabled.');
    }
    const restaurant = await this.restaurants.findOne({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurant not found.');
    restaurant.status = status;
    await this.restaurants.save(restaurant);
    const owners = await this.ownerEmails();
    return this.toItem(restaurant, owners.get(restaurant.id) ?? null);
  }

  async resetOwnerPassword(id: string, password: string) {
    const next = typeof password === 'string' ? password : '';
    if (next.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    const restaurant = await this.restaurants.findOne({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurant not found.');

    const [rows] = await getAuthPool().query(
      `SELECT id FROM \`user\`
       WHERE restaurantId = ? AND role = 'admin'
       ORDER BY createdAt ASC
       LIMIT 1`,
      [id],
    );
    const owner = (rows as Array<{ id: string }>)[0];
    if (!owner) {
      throw new NotFoundException('This restaurant has no owner account.');
    }

    const auth = await getAuth();
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(next);
    await ctx.internalAdapter.updatePassword(owner.id, hash);
    await ctx.internalAdapter.deleteUserSessions(owner.id);
    return { ok: true };
  }

  private async ownerEmails() {
    const [rows] = await getAuthPool().query(
      `SELECT email, restaurantId FROM \`user\`
       WHERE role = 'admin' AND restaurantId IS NOT NULL
       ORDER BY createdAt ASC`,
    );
    const map = new Map<string, string>();
    for (const row of rows as OwnerRow[]) {
      if (!map.has(row.restaurantId)) {
        map.set(row.restaurantId, row.email);
      }
    }
    return map;
  }

  private toItem(
    restaurant: Restaurant,
    ownerEmail: string | null,
  ): RestaurantListItem {
    return {
      id: restaurant.id,
      name: restaurant.name,
      status: restaurant.status,
      ownerEmail,
      lastLoginAt: toIso(restaurant.lastLoginAt),
      createdAt: restaurant.createdAt.toISOString(),
    };
  }
}
