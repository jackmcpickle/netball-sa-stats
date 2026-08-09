import { describe, expect, it } from 'vitest';
import { meanStrength, normalisedFinish } from '@/pipeline/scoring/strength';

describe('normalisedFinish', () => {
    it('scores the grade winner 1 and the wooden spoon 0', () => {
        expect(normalisedFinish(1, 10)).toBe(1);
        expect(normalisedFinish(10, 10)).toBe(0);
    });

    it('is symmetric about mid-table', () => {
        expect(normalisedFinish(2, 5)).toBeCloseTo(0.75, 5);
        expect(normalisedFinish(4, 5)).toBeCloseTo(0.25, 5);
    });

    it('is independent of grade size at the same relative finish', () => {
        expect(normalisedFinish(2, 3)).toBeCloseTo(
            normalisedFinish(5, 9) ?? -1,
            5,
        );
    });

    it('returns null for a one-team grade rather than dividing by zero', () => {
        expect(normalisedFinish(1, 1)).toBeNull();
    });
});

describe('meanStrength', () => {
    it('averages across a club’s teams', () => {
        expect(
            meanStrength([
                { ladderPosition: 1, teamCount: 5 },
                { ladderPosition: 5, teamCount: 5 },
            ]),
        ).toBeCloseTo(0.5, 5);
    });

    it('ignores unmeasurable rows instead of treating them as zero', () => {
        expect(
            meanStrength([
                { ladderPosition: 1, teamCount: 5 },
                { ladderPosition: 1, teamCount: 1 },
            ]),
        ).toBe(1);
    });

    it('returns null when nothing is measurable', () => {
        expect(meanStrength([])).toBeNull();
        expect(meanStrength([{ ladderPosition: 1, teamCount: 1 }])).toBeNull();
    });

    it('rises when a club sheds its weakest teams', () => {
        const before = meanStrength([
            { ladderPosition: 1, teamCount: 9 },
            { ladderPosition: 9, teamCount: 9 },
            { ladderPosition: 8, teamCount: 9 },
        ]);
        const after = meanStrength([{ ladderPosition: 1, teamCount: 9 }]);
        expect(after).toBeGreaterThan(before ?? 1);
    });
});
