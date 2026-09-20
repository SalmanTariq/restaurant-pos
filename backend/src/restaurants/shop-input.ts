import { BadRequestException } from '@nestjs/common';
import type { RestaurantStatus } from '../database/entities/restaurant.entity';

export type CreateRestaurantInput = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseCreateRestaurant(
  input: CreateRestaurantInput,
): CreateRestaurantInput {
  const name = trim(input.name);
  const ownerName = trim(input.ownerName);
  const ownerEmail = trim(input.ownerEmail).toLowerCase();
  const ownerPassword =
    typeof input.ownerPassword === 'string' ? input.ownerPassword : '';

  if (!name) throw new BadRequestException('Restaurant name is required.');
  if (!ownerName) throw new BadRequestException('Owner name is required.');
  if (!ownerEmail.includes('@')) {
    throw new BadRequestException('Owner email is required.');
  }
  if (ownerPassword.length < 8) {
    throw new BadRequestException(
      'Owner password must be at least 8 characters.',
    );
  }

  return { name, ownerName, ownerEmail, ownerPassword };
}

export function parseRestaurantStatus(status: string): RestaurantStatus {
  if (status !== 'active' && status !== 'disabled') {
    throw new BadRequestException('Status must be active or disabled.');
  }
  return status;
}

export function parsePassword(password: unknown, label = 'Password') {
  const next = typeof password === 'string' ? password : '';
  if (next.length < 8) {
    throw new BadRequestException(`${label} must be at least 8 characters.`);
  }
  return next;
}

export function parseStaffCreate(input: {
  name: string;
  email: string;
  password: string;
  role?: string;
}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email =
    typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
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

  return { name, email, password, role };
}
