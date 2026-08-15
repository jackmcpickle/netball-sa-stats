import { describe, expect, it } from 'vitest';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function baseSpec(): SeedSpec {
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                                teamCount: 1,
                                tier: 2,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                    },
                    {
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                                teamCount: 1,
                                tier: 2,
                            },
                        ],
                        isFinal: false,
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                    },
                ],
            },
        ],
    };
}

describe(createSeasonsRepo, () => {
    it('coverage() reflects seeded seasons — years and ranked years', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const coverage = await createSeasonsRepo(db).coverage();

        expect(coverage.years()).toStrictEqual([2024, 2025]);
        // 2025 is not final, so only 2024 is ranked.
        expect(coverage.rankedYears()).toStrictEqual([2024]);
    });

    it('coverage() over an empty database has no years and no ranked years', async () => {
        const db = createTestDb();

        const coverage = await createSeasonsRepo(db).coverage();

        expect(coverage.years()).toStrictEqual([]);
        expect(coverage.rankedYears()).toStrictEqual([]);
        expect(coverage.latestRankedYear()).toStrictEqual({
            error: { kind: 'no-ranked-seasons' },
            ok: false,
        });
    });

    it('fullCoverage() assembles the Coverage DTO from seeded seasons', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const coverage = await createSeasonsRepo(db).fullCoverage();

        expect(coverage.years).toStrictEqual([2024, 2025]);
        // 2025 is not final, so only 2024 is ranked.
        expect(coverage.rankedYears).toStrictEqual([2024]);
        expect(coverage.competitions).toHaveLength(1);
        expect(coverage.competitions[0]?.competition.key).toBe('amnd');
        expect(coverage.competitions[0]?.seasons).toStrictEqual([
            { note: null, status: 'ranked', year: 2024 },
            {
                note: 'Season still being played, so it is not ranked yet.',
                status: 'in-progress',
                year: 2025,
            },
        ]);
    });

    it('fullCoverage() over an empty database has no years and no competitions', async () => {
        const db = createTestDb();

        const coverage = await createSeasonsRepo(db).fullCoverage();

        expect(coverage.years).toStrictEqual([]);
        expect(coverage.rankedYears).toStrictEqual([]);
        expect(coverage.competitions).toStrictEqual([]);
    });
});
