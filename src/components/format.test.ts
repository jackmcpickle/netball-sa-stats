import { describe, expect, it } from 'vitest';
import {
    NO_VALUE,
    describeMovement,
    formatNumber,
    formatPercent,
    formatPosition,
    formatRecord,
} from '@/components/format';

describe('formatNumber', () => {
    it('formats to the requested precision', () => {
        expect(formatNumber(12.34, 1)).toBe('12.3');
        expect(formatNumber(12, 0)).toBe('12');
    });

    it('never turns a missing figure into a zero', () => {
        expect(formatNumber(null)).toBe(NO_VALUE);
        expect(formatNumber(undefined)).toBe(NO_VALUE);
        expect(formatNumber(Number.NaN)).toBe(NO_VALUE);
    });
});

describe('formatPercent', () => {
    it('renders one decimal with a sign', () => {
        expect(formatPercent(64.25)).toBe('64.3%');
    });

    it('renders missing as an em dash', () => {
        expect(formatPercent(null)).toBe(NO_VALUE);
    });
});

describe('formatRecord', () => {
    it('omits draws when there were none', () => {
        expect(formatRecord(12, 4, 0)).toBe('12–4');
        expect(formatRecord(12, 4, 1)).toBe('12–4–1');
    });

    it('renders missing as an em dash', () => {
        expect(formatRecord(null, 4, 0)).toBe(NO_VALUE);
    });
});

describe('formatPosition', () => {
    it('always states the field size', () => {
        expect(formatPosition(4, 10)).toBe('4 of 10');
    });
});

describe('describeMovement', () => {
    it('treats a lower rank number as an improvement', () => {
        expect(describeMovement(3, 7).direction).toBe('up');
        expect(describeMovement(3, 7).label).toBe('▲ 4');
    });

    it('reports a fall', () => {
        expect(describeMovement(9, 5)).toMatchObject({
            direction: 'down',
            label: '▼ 4',
        });
    });

    it('reports no change and a first season distinctly', () => {
        expect(describeMovement(5, 5).direction).toBe('level');
        expect(describeMovement(5, null).direction).toBe('new');
    });

    it('uses singular "place" for a single-step move', () => {
        expect(describeMovement(4, 5).description).toBe('Up 1 place');
        expect(describeMovement(5, 4).description).toBe('Down 1 place');
    });

    it('uses plural "places" for multi-step moves', () => {
        expect(describeMovement(3, 7).description).toBe('Up 4 places');
        expect(describeMovement(9, 5).description).toBe('Down 4 places');
    });
});
