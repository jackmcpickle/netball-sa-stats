import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { isNull } from 'es-toolkit';
import { describe, expect, it } from 'vitest';
import {
    COMPETITION_SEEDS,
    buildGradeWeights,
    championshipCompetitionKeys,
} from '@/pipeline/seed/catalogue';
import type { GradeWeightSeed } from '@/pipeline/seed/catalogue';

describe('competition catalogue', () => {
    it('has unique keys', () => {
        const keys = COMPETITION_SEEDS.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('only claims data for competitions with a confirmed org id', () => {
        const withDataMissingOrgId = COMPETITION_SEEDS.filter(
            (competition) =>
                competition.hasData && isNull(competition.playhqOrgId),
        ).map((competition) => competition.key);
        expect(withDataMissingOrgId).toStrictEqual([]);
    });

    it('lists the metro associations with verified PlayHQ org ids', () => {
        const keys = [
            'saucna',
            'suna',
            'elizabeth',
            'city_night_division',
            'sammna',
        ];
        for (const key of keys) {
            const seed = COMPETITION_SEEDS.find(
                (competition) => competition.key === key,
            );
            expect(seed?.playhqOrgId).toMatch(/^[0-9a-f]{8}$/u);
            expect(seed?.hasData).toBeFalsy();
        }
    });

    it('seeds SADNA by name only, with no invented PlayHQ org id', () => {
        const seed = COMPETITION_SEEDS.find(
            (competition) => competition.key === 'sadna',
        );
        expect(seed?.playhqOrgId).toBeNull();
        expect(seed?.hasData).toBeFalsy();
    });

    it('does not seed Hills or the country tail', () => {
        const keys = COMPETITION_SEEDS.map((competition) => competition.key);
        expect(keys).not.toContain('hills');
        expect(keys).not.toContain('mid_hills');
        expect(keys).not.toContain('shna');
        expect(keys).not.toContain('gsna');
        expect(keys).not.toContain('barossa');
        const orgIds = COMPETITION_SEEDS.map(
            (competition) => competition.playhqOrgId,
        );
        expect(orgIds).not.toContain('e801d340');
        expect(orgIds).not.toContain('cd26c84e');
        expect(orgIds).not.toContain('489c7576');
    });

    it('does not claim data for any new association', () => {
        const claiming = COMPETITION_SEEDS.filter(
            (competition) =>
                competition.hasData &&
                !['amnd', 'premier_league', 'premier_league_reserves'].includes(
                    competition.key,
                ),
        );
        expect(claiming).toStrictEqual([]);
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
        expect(find('Premier Division')?.weight).toBe(1);
        expect(find('Reserves Division')?.weight).toBe(0.8);
        expect(find('AMND League')?.weight).toBe(0.75);
    });

    it('descends within a band', () => {
        expect(find('B 1')?.weight).toBe(0.62);
        expect(find('B 6')?.weight).toBe(0.47);
    });

    it('covers archive Junior and Sub-Junior division 9 grades', () => {
        expect(find('Junior 9')).toMatchObject({
            competitionKey: 'amnd',
            division: 9,
            tier: 8,
        });
        expect(find('Sub-Junior 9')).toMatchObject({
            competitionKey: 'amnd',
            division: 9,
            tier: 9,
        });
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

    it('keeps the championship on AMND and Premier League until new weights exist', () => {
        expect([...championshipCompetitionKeys()].toSorted()).toStrictEqual([
            'amnd',
            'premier_league',
            'premier_league_reserves',
        ]);
    });
});

describe('migration drift guard', () => {
    // Wrangler tracks applied migrations by filename, not content. Editing an
    // already-applied migration (e.g. 0001_seed.sql) to add a band never
    // re-runs anywhere, so remote silently diverges from the catalogue. This
    // reads every drizzle/*.sql migration in order, replays the INSERTs and
    // UPDATEs it makes to grade_weights (an UPDATE overriding a value set by
    // an earlier INSERT, same as applying them against a real database), and
    // checks the resulting (tier, division) -> weight map against the
    // catalogue. A band added to catalogue.ts without a corresponding
    // migration fails here, and so does a weight edited in place on an
    // already-applied migration without a matching UPDATE (the 0004 case).
    const drizzleDir = resolve(import.meta.dirname, '../../../drizzle');
    const insertedGradeKeys = new Set<string>();
    const appliedWeights = new Map<string, number>();

    for (const file of readdirSync(drizzleDir).toSorted()) {
        if (!file.endsWith('.sql')) {
            continue;
        }
        const sql = readFileSync(resolve(drizzleDir, file), 'utf-8');
        const inserts = sql.matchAll(
            /INSERT INTO grade_weights[\s\S]*?SELECT id, (?<tier>\d+), (?<division>\d+|NULL), '[^']*', (?<weight>[\d.]+) FROM/gu,
        );
        for (const { groups } of inserts) {
            const { tier, division, weight } = groups ?? {};
            const key = `${tier}:${division === 'NULL' ? '-' : division}`;
            insertedGradeKeys.add(key);
            appliedWeights.set(key, Number(weight));
        }
        const updates = sql.matchAll(
            /UPDATE grade_weights SET weight = (?<weight>[\d.]+)\s+WHERE tier = (?<tier>\d+) AND division = (?<division>\d+)/gu,
        );
        for (const { groups } of updates) {
            const { weight, tier, division } = groups ?? {};
            appliedWeights.set(`${tier}:${division}`, Number(weight));
        }
    }

    const catalogueGradeKeys = new Set(
        buildGradeWeights().map((w) => `${w.tier}:${w.division ?? '-'}`),
    );
    const catalogueWeights = new Map(
        buildGradeWeights().map((w) => [
            `${w.tier}:${w.division ?? '-'}`,
            w.weight,
        ]),
    );

    it('has a migration inserting every catalogue grade weight', () => {
        for (const key of catalogueGradeKeys) {
            expect(insertedGradeKeys.has(key)).toBeTruthy();
        }
    });

    it('has no migration inserting a grade weight absent from the catalogue', () => {
        for (const key of insertedGradeKeys) {
            expect(catalogueGradeKeys.has(key)).toBeTruthy();
        }
    });

    it('inserts as many distinct grade weights across migrations as the catalogue defines', () => {
        expect(insertedGradeKeys.size).toBe(catalogueGradeKeys.size);
    });

    it('replays to the same weight value the catalogue defines for every grade', () => {
        for (const [key, weight] of catalogueWeights) {
            expect(appliedWeights.get(key)).toBe(weight);
        }
    });
});
