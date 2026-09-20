import { publicErrorMessage } from './http-error';

describe('publicErrorMessage', () => {
  it('uses the MySQL sqlMessage from TypeORM failures', () => {
    expect(
      publicErrorMessage({
        message: 'QueryFailedError: Unknown column',
        driverError: {
          sqlMessage: "Unknown column 'nameUrdu' in 'field list'",
        },
      }),
    ).toBe("Unknown column 'nameUrdu' in 'field list'");
  });

  it('falls back to a generic message', () => {
    expect(publicErrorMessage(undefined)).toBe('Internal server error');
  });
});
