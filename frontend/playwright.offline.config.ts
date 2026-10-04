import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testMatch: 'offline-shell.spec.ts',
  use: { ...config.use, baseURL: 'http://127.0.0.1:1430' },
  projects: [{ name: 'production-offline', use: { ...config.projects![0].use, baseURL: 'http://127.0.0.1:1430' } }],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 1430', url: 'http://127.0.0.1:1430', reuseExistingServer: false },
});
