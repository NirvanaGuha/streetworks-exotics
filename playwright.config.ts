import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build (npm run build first), served the same way
// as in production. "iphone" runs in WebKit, Safari's engine.
const PORT = 4380;

export default defineConfig({
    testDir: './tests',
    timeout: 90_000,
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node dist/server/entry.mjs',
        url: `http://127.0.0.1:${PORT}/`,
        env: { PORT: String(PORT), HOST: '127.0.0.1' },
        reuseExistingServer: false,
        timeout: 30_000,
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
        { name: 'iphone', use: { ...devices['iPhone 13'] } },
    ],
});
