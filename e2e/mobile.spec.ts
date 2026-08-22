import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PAGES = [
    { path: '/', heading: /Which AMND \/ Premier League club is really strongest/i },
    { path: '/leagues', heading: /South Australian associations/i },
    { path: '/clubs', heading: /Clubs by league/i },
    { path: '/clubs/matrics', heading: /Matrics/i },
    { path: '/ladders', heading: /Where every team finished/i },
    { path: '/head-to-head', heading: /Head to head/i },
    { path: '/results', heading: /^Results$/i },
    { path: '/method', heading: /How the championship score is built/i },
] as const;

const NAV_LABELS = [
    'Rankings',
    'Leagues',
    'Clubs',
    'Ladders',
    'Head to head',
    'Results',
    'Method',
] as const;

async function pageOverflow(page: Page): Promise<number> {
    return page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
    });
}

async function openMobileMenu(page: Page): Promise<void> {
    const toggle = page.getByRole('button', { name: /open menu/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(
        page.getByRole('button', { name: /close menu/i }),
    ).toBeVisible();
    await expect(page.locator('#mobile-nav')).toBeVisible();
}

test.describe('mobile layout', () => {
    for (const pageDef of PAGES) {
        test(`${pageDef.path} loads without page-level horizontal overflow`, async ({
            page,
        }) => {
            const response = await page.goto(pageDef.path, {
                waitUntil: 'networkidle',
            });
            expect(response?.ok()).toBeTruthy();
            await expect(
                page.getByRole('heading', { name: pageDef.heading }).first(),
            ).toBeVisible();
            expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
        });
    }

    test('mobile menu exposes every section link', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await openMobileMenu(page);

        const menu = page.locator('#mobile-nav');
        for (const label of NAV_LABELS) {
            await expect(
                menu.getByRole('link', { name: label, exact: true }),
            ).toBeVisible();
        }

        await menu.getByRole('link', { name: 'Method', exact: true }).click();
        await expect(page).toHaveURL(/\/method$/);
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
        await expect(
            page.getByRole('button', { name: /open menu/i }),
        ).toBeVisible();
    });

    test('escape closes the mobile menu', async ({ page }) => {
        await page.goto('/clubs', { waitUntil: 'networkidle' });
        await openMobileMenu(page);
        await page.keyboard.press('Escape');
        await expect(
            page.getByRole('button', { name: /open menu/i }),
        ).toBeVisible();
        await expect(page.locator('#mobile-nav')).toBeHidden();
    });

    test('championship and ladder tables scroll inside their frames', async ({
        page,
    }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const championshipFrame = page
            .locator('.overflow-x-auto')
            .filter({ has: page.locator('table') })
            .first();
        await expect(championshipFrame).toBeVisible();
        const championshipScroll = await championshipFrame.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        expect(championshipScroll.scrollWidth).toBeGreaterThan(
            championshipScroll.clientWidth,
        );
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

        await page.goto('/ladders', { waitUntil: 'networkidle' });
        const ladderFrame = page
            .locator('.overflow-x-auto')
            .filter({ has: page.locator('table') })
            .first();
        await expect(ladderFrame).toBeVisible();
        const ladderScroll = await ladderFrame.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        expect(ladderScroll.scrollWidth).toBeGreaterThan(
            ladderScroll.clientWidth,
        );
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });

    test('rankings hero stats stack without clipping on narrow phones', async ({
        page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name !== 'narrow-320',
            'Only assert the stacked layout on the 320px project',
        );
        await page.goto('/', { waitUntil: 'networkidle' });
        const caption = page.getByText('season in progress (2026)');
        await expect(caption).toBeVisible();
        const box = await caption.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
            expect(box.x + box.width).toBeLessThanOrEqual(320 + 1);
        }
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });

    test('club profile filters and charts stay within the page', async ({
        page,
    }) => {
        await page.goto('/clubs/matrics', { waitUntil: 'networkidle' });
        await expect(
            page.getByRole('heading', { name: 'Matrics' }),
        ).toBeVisible();
        await expect(
            page.getByRole('combobox', { name: 'Club' }),
        ).toBeVisible();
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });
});
