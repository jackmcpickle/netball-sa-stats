import { describe, expect, it } from 'vitest';
import { loadLaddersData } from '@/server/loaders/ladders';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/**
 * Shared seed for every case: one competition ('amnd') with two FINAL
 * seasons (2024, 2025) each with one tier-2 grade of 3 clubs, plus one
 * NON-FINAL 2026 season with its own tier-2 grade of 3 clubs. Ladders
 * (unlike rankings) key off `coverage.years`, which is every covered year
 * regardless of `isFinal` — so the "latest" year here is 2026, not 2025.
 */
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

describe('loadLaddersData', () => {
    it('defaults to the latest season and its first grade', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadLaddersData(db, {});

        // `coverage.years` is every covered year regardless of `isFinal`, so
        // the "latest" year is the non-final 2026 season, not the latest
        // ranked (2025) one — unlike rankings, ladders are not restricted to
        // final seasons.
        expect(result.year).toBe(2026);
        expect(result.grades).toHaveLength(1);
        expect(result.grades[0]?.key).toBe('amnd-2026-a1');
        expect(result.ladder?.grade.key).toBe('amnd-2026-a1');
        expect(result.ladder?.rows).toHaveLength(3);
    });

    it('falls back to first grade when grade key is unknown', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadLaddersData(db, {
            year: 2024,
            grade: 'does-not-exist',
        });

        expect(result.year).toBe(2024);
        expect(result.ladder?.grade.key).toBe('amnd-2024-a1');
    });

    it('returns ladder null for a season with no grades', async () => {
        const db = createTestDb();
        const spec = baseSpec();
        spec.competitions.push({
            key: 'amnd-2023',
            name: 'AMND 2023',
            seasons: [
                {
                    seasonKey: 'amnd-2023',
                    startYear: 2023,
                    isFinal: true,
                    grades: [],
                },
            ],
        });
        await seed(db, spec);

        const result = await loadLaddersData(db, { year: 2023 });

        expect(result.year).toBe(2023);
        expect(result.grades).toHaveLength(0);
        expect(result.ladder).toBeNull();
    });

    it('characterises the empty-dataset year bug', async () => {
        const db = createTestDb();

        // BUG (known, not fixed here): with a completely empty database,
        // `coverage.years` and `coverage.rankedYears` are both empty, so the
        // `(coverage.years.at(-1) ?? coverage.rankedYears[0])` fallback in
        // `loadLaddersData` produces `year === undefined` even though
        // `LaddersData.year` is typed `number`. That `undefined` is then
        // passed to `listGrades(db, year)`, whose query binds `year` as a
        // SQLite statement parameter — and `undefined` cannot be bound, so
        // the loader call rejects with a `TypeError` rather than returning a
        // `LaddersData` with an `undefined` year. Task 5 of this plan
        // (EmptyDataset error) fixes the root cause; when it lands, flip this
        // assertion to expect that intentional error instead of this
        // incidental bind-time crash.
        await expect(loadLaddersData(db, {})).rejects.toThrow(/Failed query/iu);
    });
});
