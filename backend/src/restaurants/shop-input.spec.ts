import { BadRequestException } from '@nestjs/common';
import {
  parseCreateRestaurant,
  parsePassword,
  parseRestaurantStatus,
  parseStaffCreate,
} from './shop-input';

describe('parseCreateRestaurant', () => {
  const valid = {
    name: '  Test Kitchen  ',
    ownerName: ' Ayesha ',
    ownerEmail: 'Owner@Example.com',
    ownerPassword: 'password1234',
  };

  it('trims name and lowercases email', () => {
    expect(parseCreateRestaurant(valid)).toEqual({
      name: 'Test Kitchen',
      ownerName: 'Ayesha',
      ownerEmail: 'owner@example.com',
      ownerPassword: 'password1234',
    });
  });

  it('rejects a blank restaurant name', () => {
    expect(() => parseCreateRestaurant({ ...valid, name: '  ' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing owner email', () => {
    expect(() => parseCreateRestaurant({ ...valid, ownerEmail: 'nope' })).toThrow(
      /Owner email/,
    );
  });

  it('rejects a short owner password', () => {
    expect(() =>
      parseCreateRestaurant({ ...valid, ownerPassword: 'short' }),
    ).toThrow(/8 characters/);
  });
});

describe('parseRestaurantStatus', () => {
  it('accepts active and disabled', () => {
    expect(parseRestaurantStatus('active')).toBe('active');
    expect(parseRestaurantStatus('disabled')).toBe('disabled');
  });

  it('rejects anything else', () => {
    expect(() => parseRestaurantStatus('paused')).toThrow(BadRequestException);
  });
});

describe('parsePassword', () => {
  it('returns a long enough password', () => {
    expect(parsePassword('password1')).toBe('password1');
  });

  it('rejects short values', () => {
    expect(() => parsePassword('1234567')).toThrow(BadRequestException);
  });

  it('uses a custom label in the error', () => {
    expect(() => parsePassword('short', 'Owner password')).toThrow(
      /Owner password/,
    );
  });
});

describe('parseStaffCreate', () => {
  const valid = {
    name: ' Bilal ',
    email: 'Bilal@Shop.com',
    password: 'cashier99',
    role: 'cashier',
  };

  it('defaults unknown roles to cashier', () => {
    expect(parseStaffCreate({ ...valid, role: 'cook' }).role).toBe('cashier');
  });

  it('keeps admin', () => {
    expect(parseStaffCreate({ ...valid, role: 'admin' }).role).toBe('admin');
  });

  it('blocks platform role', () => {
    expect(() => parseStaffCreate({ ...valid, role: 'platform' })).toThrow(
      /platform/,
    );
  });

  it('requires name, email, and password', () => {
    expect(() => parseStaffCreate({ ...valid, name: '' })).toThrow(/Name/);
    expect(() => parseStaffCreate({ ...valid, email: 'x' })).toThrow(/Email/);
    expect(() => parseStaffCreate({ ...valid, password: 'tiny' })).toThrow(
      /8 characters/,
    );
  });
});
