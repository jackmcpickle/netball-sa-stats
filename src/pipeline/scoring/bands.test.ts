import { describe, expect, it } from 'vitest';
import { bandLabel } from '@/pipeline/scoring/bands';

describe('bandLabel', () => {
    it('collapses divisions to one band name', () => {
        expect(bandLabel(10)).toBe('Primary');
        expect(bandLabel(5)).toBe('B');
    });

    it('keeps single-grade bands as their own name', () => {
        expect(bandLabel(1)).toBe('Premier Division');
        expect(bandLabel(3)).toBe('AMND League');
    });

    it('falls back rather than throwing on an unknown tier', () => {
        expect(bandLabel(99)).toBe('Tier 99');
    });
});
