import { describe, expect, it } from 'vitest';
import {
    bandX,
    barHeight,
    linePath,
    rankTicks,
    rankY,
    round,
    type Plot,
} from '@/components/charts/scale';

const PLOT: Plot = { x0: 40, x1: 1040, y0: 0, y1: 300 };

describe('round', () => {
    it('rounds to the requested precision', () => {
        expect(round(1.23456, 2)).toBe(1.23);
        expect(round(1.23456, 0)).toBe(1);
    });
});

describe('bandX', () => {
    it('spans the full inner width across the categories', () => {
        expect(bandX(0, 5, PLOT)).toBe(40);
        expect(bandX(4, 5, PLOT)).toBe(1040);
        expect(bandX(2, 5, PLOT)).toBe(540);
    });

    it('pins a single category to the left edge instead of dividing by zero', () => {
        expect(bandX(0, 1, PLOT)).toBe(40);
        expect(bandX(0, 0, PLOT)).toBe(40);
    });
});

describe('rankY', () => {
    it('inverts the axis so rank 1 is at the top', () => {
        expect(rankY(1, 25, PLOT)).toBe(0);
        expect(rankY(25, 25, PLOT)).toBe(300);
        expect(rankY(13, 25, PLOT)).toBe(150);
    });

    it('clamps out-of-range ranks into the plot', () => {
        expect(rankY(0, 25, PLOT)).toBe(0);
        expect(rankY(99, 25, PLOT)).toBe(300);
    });

    it('handles a one-club championship', () => {
        expect(rankY(1, 1, PLOT)).toBe(0);
    });
});

describe('rankTicks', () => {
    it('labels rank 1 and always includes the worst rank', () => {
        expect(rankTicks(9, 2)).toStrictEqual([1, 3, 5, 7, 9]);
        expect(rankTicks(10, 3)).toStrictEqual([1, 4, 7, 10]);
        expect(rankTicks(8, 3)).toStrictEqual([1, 4, 7, 8]);
    });

    it('degrades safely', () => {
        expect(rankTicks(0, 2)).toStrictEqual([]);
        expect(rankTicks(3, 0)).toStrictEqual([1, 2, 3]);
    });
});

describe('linePath', () => {
    it('emits a single move followed by line segments', () => {
        expect(
            linePath([
                { x: 0, y: 10 },
                { x: 5, y: 20 },
                { x: 10, y: 15 },
            ]),
        ).toBe('M0 10 L5 20 L10 15');
    });

    it('breaks the line across a gap rather than interpolating', () => {
        expect(linePath([{ x: 0, y: 10 }, null, { x: 10, y: 15 }])).toBe(
            'M0 10 M10 15',
        );
    });

    it('returns an empty path when there is nothing to draw', () => {
        expect(linePath([])).toBe('');
        expect(linePath([null, null])).toBe('');
    });
});

describe('barHeight', () => {
    it('scales proportionally to the tallest bar', () => {
        expect(barHeight(50, 100, 130)).toBe(65);
        expect(barHeight(100, 100, 130)).toBe(130);
    });

    it('returns zero for an empty or negative range', () => {
        expect(barHeight(10, 0, 130)).toBe(0);
        expect(barHeight(-5, 100, 130)).toBe(0);
    });
});
