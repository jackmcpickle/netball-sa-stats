// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PointsBarChart } from '@/components/charts/points-bar-chart';

describe(PointsBarChart, () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the reveal hook asks about reduced motion.
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => ({ matches: true })),
        );
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('labels a ranked year without a championship team instead of "#0"', () => {
        render(
            <PointsBarChart
                accent="pink"
                seasons={[
                    { points: 12.5, rank: 3, status: 'ranked', year: 2025 },
                    { points: 0, rank: null, status: 'ranked', year: 2026 },
                ]}
            />,
        );

        expect(
            screen.getByText('2025: 12.5 championship points, ranked 3.'),
        ).toBeDefined();
        expect(screen.getByText('2026: no championship team.')).toBeDefined();
        expect(screen.queryByText('#0')).toBeNull();
    });
});
