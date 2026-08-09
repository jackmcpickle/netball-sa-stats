import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'iPhone 12',
            use: { ...devices['iPhone 12'] },
        },
        {
            name: 'Pixel 5',
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'iPhone SE',
            use: {
                ...devices['iPhone SE'],
                viewport: { width: 375, height: 667 },
            },
        },
        {
            name: 'narrow-320',
            use: {
                ...devices['iPhone SE'],
                viewport: { width: 320, height: 568 },
                isMobile: true,
                hasTouch: true,
            },
        },
    ],
    webServer: {
        command: 'vp dev --host 127.0.0.1 --port 3000',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
