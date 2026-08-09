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
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                tier: 2,
                                teamCount: 1,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                        isFinal: false,
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
                                name: 'A1',
                                tier: 2,
                                teamCount: 1,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('createSeasonsRepo', () => {
    it('coverage() reflects seeded seasons — years and ranked years', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const coverage = await createSeasonsRepo(db).coverage();

        expect(coverage.years()).toEqual([2024, 2025]);
        // 2025 is not final, so only 2024 is ranked.
        expect(coverage.rankedYears()).toEqual([2024]);
    });

    it('coverage() over an empty database has no years and no ranked years', async () => {
        const db = createTestDb();

        const coverage = await createSeasonsRepo(db).coverage();

        expect(coverage.years()).toEqual([]);
        expect(coverage.rankedYears()).toEqual([]);
        expect(coverage.latestRankedYear()).toEqual({
            ok: false,
            error: { kind: 'no-ranked-seasons' },
        });
    });
});
