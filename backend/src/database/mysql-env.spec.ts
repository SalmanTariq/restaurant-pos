import { mysqlEnv } from './mysql-env';

describe('mysqlEnv', () => {
  const keys = [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
  ] as const;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it('uses local pos defaults', () => {
    expect(mysqlEnv()).toEqual({
      host: '127.0.0.1',
      port: 3306,
      user: 'pos',
      password: 'pos',
      database: 'pos',
    });
  });

  it('reads overrides from the environment', () => {
    process.env.MYSQL_HOST = 'db.internal';
    process.env.MYSQL_PORT = '3307';
    process.env.MYSQL_USER = 'app';
    process.env.MYSQL_PASSWORD = 'secret';
    process.env.MYSQL_DATABASE = 'pos_prod';
    expect(mysqlEnv()).toEqual({
      host: 'db.internal',
      port: 3307,
      user: 'app',
      password: 'secret',
      database: 'pos_prod',
    });
  });
});
