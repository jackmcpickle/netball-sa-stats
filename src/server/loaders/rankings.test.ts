import { describe, expect, it } from 'vitest';
import { loadRankingsData } from '@/server/loaders/rankings';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/**
 * Shared seed for every case: two FINAL seasons (2024, 2025) each with one
 * tier-2 grade of 3 clubs, plus one NON-FINAL 2026 season (excluded from
 * `rankedYears` by `rankedYears()` in coverage.ts, so it must never surface
 * as the "latest" ranked year).
 *
 * Each season gets its own competition rather than sharing one. `seed()`'s
 * `seedSeason` resets its `weightedTiers` de-dup set per season, so two
 * seasons in the *same* competition at the *same* tier each insert a
 * `grade_weights` row for (competitionId, tier, division). SQLite's unique
 * index treats those as non-duplicate because `division` is NULL (NULL is
 * never equal to NULL for uniqueness), so both rows survive — and then
 * `fetchResults`'s weight `LEFT JOIN` fans every ladder/result row out once
 * per matching weight row, silently multiplying row counts. That's a latent
 * bug in the fixtures helper (Task 1, not touched here), not the loader
 * under test, so this seed sidesteps it with separate competitions per
 * season instead of exercising it.
 */
function baseSpec(): SeedSpec {
    return {
        competitions: [
            {
                key: 'amnd-2024',
                name: 'AMND 2024',
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
                                teamCount: 3,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 2,
                                    },
                                    {
                                        clubKey: 'ajax',
                                        clubName: 'Ajax',
                                        displayName: 'Ajax',
                                        ladderPosition: 3,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                key: 'amnd-2025',
                name: 'AMND 2025',
                seasons: [
                    {
                        seasonKey: 'amnd-2025',
                        startYear: 2025,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2025-a1',
                                name: 'A1',
                                tier: 2,
                                teamCount: 3,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 2,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'ajax',
                                        clubName: 'Ajax',
                                        displayName: 'Ajax',
                                        ladderPosition: 3,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                key: 'amnd-2026',
                name: 'AMND 2026',
                seasons: [
                    {
                        seasonKey: 'amnd-2026',
                        startYear: 2026,
                        isFinal: false,
                        grades: [
                            {
                                gradeKey: 'amnd-2026-a1',
                                name: 'A1',
                                tier: 2,
                                teamCount: 3,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 2,
                                    },
                                    {
                                        clubKey: 'ajax',
                                        clubName: 'Ajax',
                                        displayName: 'Ajax',
                                        ladderPosition: 3,
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

describe('loadRankingsData', () => {
    it('returns the latest ranked season by default', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadRankingsData(db, {});

        expect(result.season.year).toBe(2025);
    });

    it('falls back to latest when season is not ranked', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadRankingsData(db, { season: 1999 });

        expect(result.season.year).toBe(2025);
    });

    it('honours a valid requested season', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadRankingsData(db, { season: 2024 });

        expect(result.season.year).toBe(2024);
        // 2024 is the earliest ranked year in this seed, so there is no
        // ranked year before it to report as `previousYear`.
        expect(result.previousYear).toBeNull();
    });

    it('clamps an out-of-range page to the last page', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadRankingsData(db, { page: 999 });

        expect(result.season.rows.length).toBeGreaterThan(0);
        // Only 3 clubs at the default page size (50), so everything fits on
        // page 1 regardless of the clamp — the clamp logic itself is covered
        // by `applyTableState`'s own tests; this asserts the loader wires it
        // through end-to-end without losing rows.
        expect(result.tableState.page).toBe(1);
    });

    it('rejects a sort column outside the allow-list', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadRankingsData(db, { sort: 'evil' });

        expect(result.tableState.sort).toBe('rank');
    });
});
