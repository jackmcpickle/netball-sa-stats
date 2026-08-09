import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Device presets for iPhone use WebKit by default. This environment only
 * installs Chromium, so every project forces `desktop-chromium` while keeping
 * the mobile viewport / touch / UA from the device descriptor.
 */
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
        browserName: 'chromium',
    },
    projects: [
        {
            name: 'desktop-chromium',
            use: {
                ...devices['Desktop Chrome'],
                browserName: 'chromium',
                defaultBrowserType: 'chromium',
                viewport: { width: 1280, height: 800 },
            },
        },
        {
            name: 'iPhone 12',
            use: {
                ...devices['iPhone 12'],
                browserName: 'chromium',
                defaultBrowserType: 'chromium',
            },
        },
        {
            name: 'Pixel 5',
            use: {
                ...devices['Pixel 5'],
                browserName: 'chromium',
                defaultBrowserType: 'chromium',
            },
        },
        {
            name: 'iPhone SE',
            use: {
                ...devices['iPhone SE'],
                viewport: { width: 375, height: 667 },
                browserName: 'chromium',
                defaultBrowserType: 'chromium',
            },
        },
        {
            name: 'narrow-320',
            use: {
                ...devices['iPhone SE'],
                viewport: { width: 320, height: 568 },
                isMobile: true,
                hasTouch: true,
                browserName: 'chromium',
                defaultBrowserType: 'chromium',
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
