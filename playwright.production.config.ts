import { defineConfig } from '@playwright/test';

// Set RIPIFY_URL to the assigned HTTPS deployment to run exactly the same smoke
// against hosting. The default checks the built files, never the Vite dev server.
const baseURL = process.env.RIPIFY_URL ?? 'http://127.0.0.1:4173';
const local = new URL(baseURL).hostname === '127.0.0.1';
export default defineConfig({
  testDir: './tests/production', timeout: 120000, workers: 1,
  use: { baseURL, viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-webgl', '--use-angle=d3d11', '--ignore-gpu-blocklist'] } },
  webServer: local ? { command: 'npm run preview -- --port 4173 --strictPort', url: baseURL, reuseExistingServer: true } : undefined,
  reporter: 'list',
});
