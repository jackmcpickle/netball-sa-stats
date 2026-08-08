import { describe, expect, it } from 'vitest';
import {
    COMPETITION_SEEDS,
    buildGradeWeights,
} from '@/pipeline/seed/catalogue';
import type { GradeWeightSeed } from '@/pipeline/seed/catalogue';

describe('competition catalogue', () => {
    it('has unique keys', () => {
        const keys = COMPETITION_SEEDS.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('only claims data for competitions with a confirmed org id', () => {
        for (const competition of COMPETITION_SEEDS) {
            if (competition.hasData) {
                expect(competition.playhqOrgId).not.toBeNull();
            }
        }
    });
});

describe('grade weights', () => {
    const weights = buildGradeWeights();
    function find(label: string): GradeWeightSeed | undefined {
        return weights.find((w) => w.label === label);
    }

    it('is unique on competition, tier and division', () => {
        const seen = weights.map(
            (w) => `${w.competitionKey}:${w.tier}:${w.division ?? '-'}`,
        );
        expect(new Set(seen).size).toBe(seen.length);
    });

    it('keeps every weight within 0..1', () => {
        for (const weight of weights) {
            expect(weight.weight).toBeGreaterThan(0);
            expect(weight.weight).toBeLessThanOrEqual(1);
        }
    });

    it('anchors Premier Division at 1.0 and Reserves above AMND League', () => {
        expect(find('Premier Division')?.weight).toBe(1.0);
        expect(find('Reserves Division')?.weight).toBe(0.8);
        expect(find('AMND League')?.weight).toBe(0.75);
    });

    it('descends within a band', () => {
        expect(find('B 1')?.weight).toBe(0.62);
        expect(find('B 6')?.weight).toBe(0.47);
    });

    it('ranks C below Inter', () => {
        const lowestInter = find('Inter. 5');
        const highestC = find('C 1');
        expect(highestC?.weight).toBeLessThan(lowestInter?.weight ?? 0);
    });

    it('rounds cleanly rather than carrying float noise', () => {
        for (const weight of weights) {
            expect(weight.weight).toBe(Math.round(weight.weight * 1000) / 1000);
        }
    });
});
