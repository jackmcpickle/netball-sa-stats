/**
 * Rasterises `public/favicon.svg` into the PNG sizes Apple and Android need.
 * Chromium (already present for Playwright e2e) is the renderer, so there is
 * no extra image dependency.
 *
 * Run after editing the mark: `node --experimental-strip-types scripts/generate-icons.ts`
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const publicDir = join(import.meta.dirname, '..', 'public');

/** Apple ignores transparency and dislikes rounding, so it gets a square. */
const targets = [
    { name: 'apple-touch-icon.png', size: 180, square: true },
    { name: 'icon-192.png', size: 192, square: false },
    { name: 'icon-512.png', size: 512, square: false },
] as const;

async function main(): Promise<void> {
    const svg = await readFile(join(publicDir, 'favicon.svg'), 'utf-8');
    const browser = await chromium.launch();

    try {
        await Promise.all(
            targets.map(async ({ name, size, square }) => {
                const page = await browser.newPage({
                    deviceScaleFactor: 1,
                    viewport: { height: size, width: size },
                });
                const markup = (
                    square ? svg.replace(' rx="7"', '') : svg
                ).replace(
                    /width="32" height="32"/u,
                    `width="${size}" height="${size}"`,
                );
                await page.setContent(
                    `<html><body style="margin:0">${markup}</body></html>`,
                );
                await writeFile(
                    join(publicDir, name),
                    await page
                        .locator('svg')
                        .screenshot({ omitBackground: true }),
                );
                await page.close();
            }),
        );
    } finally {
        await browser.close();
    }
}

await main();
