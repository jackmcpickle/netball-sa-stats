import { expect, test, type Locator, type Page } from '@playwright/test';

async function waitForRevealed(chart: Locator): Promise<void> {
    await expect(chart).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute('data-revealed', 'true', {
        timeout: 10_000,
    });
}

async function hoverChartPoint(
    page: Page,
    chart: Locator,
    point: Locator,
): Promise<void> {
    await point.scrollIntoViewIfNeeded();
    const box = await point.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chart.getByTestId('chart-tooltip')).toHaveAttribute(
        'data-visible',
        'true',
    );
}

test.describe('chart interactivity', () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(
            testInfo.project.name !== 'desktop-chromium',
            'Pointer tooltips are validated on the desktop project',
        );
    });

    test('rank movement chart reveals on scroll and shows a tooltip', async ({
        page,
    }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const chart = page.getByTestId('rank-movement-chart');
        await waitForRevealed(chart);

        const point = chart.locator('[data-point-id]').first();
        await expect(point).toBeVisible();
        const label = await point.getAttribute('data-label');
        const year = await point.getAttribute('data-year');
        const value = await point.getAttribute('data-value');
        expect(label).toBeTruthy();
        expect(year).toBeTruthy();
        expect(value).toBeTruthy();

        await hoverChartPoint(page, chart, point);

        const tooltip = chart.getByTestId('chart-tooltip');
        await expect(tooltip).toContainText(label ?? '');
        await expect(tooltip).toContainText(year ?? '');
        await expect(tooltip).toContainText(value ?? '');

        await page.mouse.move(0, 0);
        await expect(tooltip).toHaveAttribute('data-visible', 'false');
    });

    test('trend and bar charts reveal and tooltips follow the pointer', async ({
        page,
    }) => {
        await page.goto('/clubs/matrics', { waitUntil: 'networkidle' });

        const trend = page.getByTestId('trend-chart');
        await waitForRevealed(trend);
        const trendPoint = trend.locator('[data-point-id]').first();
        const trendLabel = await trendPoint.getAttribute('data-label');
        const trendYear = await trendPoint.getAttribute('data-year');
        const trendValue = await trendPoint.getAttribute('data-value');
        await hoverChartPoint(page, trend, trendPoint);
        const trendTip = trend.getByTestId('chart-tooltip');
        await expect(trendTip).toContainText(trendLabel ?? '');
        await expect(trendTip).toContainText(trendYear ?? '');
        await expect(trendTip).toContainText(trendValue ?? '');

        const bars = page.getByTestId('points-bar-chart');
        await waitForRevealed(bars);
        await expect(bars.locator('.chart-bar').first()).toBeVisible();

        const barPoint = bars.locator('[data-point-id]').first();
        const barLabel = await barPoint.getAttribute('data-label');
        const barValue = await barPoint.getAttribute('data-value');
        await hoverChartPoint(page, bars, barPoint);
        const barTip = bars.getByTestId('chart-tooltip');
        await expect(barTip).toContainText(barLabel ?? '');
        if (barValue && barValue !== 'n/a') {
            await expect(barTip).toContainText(barValue);
        }
    });
});
