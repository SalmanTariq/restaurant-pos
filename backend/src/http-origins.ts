const DEV_ORIGINS = [
  'http://localhost:1420',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
];

export function httpOrigins(): string[] {
  const extra = [
    process.env.PUBLIC_ORIGIN,
    process.env.BETTER_AUTH_URL,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return [...new Set([...DEV_ORIGINS, ...extra])];
}
