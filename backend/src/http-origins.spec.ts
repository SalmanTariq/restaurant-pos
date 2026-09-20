import { httpOrigins } from './http-origins';

describe('httpOrigins', () => {
  const keys = ['PUBLIC_ORIGIN', 'BETTER_AUTH_URL', 'CORS_ORIGINS'] as const;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it('includes local till origins', () => {
    expect(httpOrigins()).toContain('http://localhost:1420');
  });

  it('adds the public origin used in production', () => {
    process.env.PUBLIC_ORIGIN = 'https://pos.example.com';
    expect(httpOrigins()).toContain('https://pos.example.com');
  });

  it('splits extra CORS origins and de-duplicates', () => {
    process.env.CORS_ORIGINS = 'https://a.example, https://b.example, https://a.example';
    process.env.BETTER_AUTH_URL = 'https://a.example';
    const origins = httpOrigins();
    expect(origins.filter((value) => value === 'https://a.example')).toHaveLength(1);
    expect(origins).toContain('https://b.example');
  });
});
