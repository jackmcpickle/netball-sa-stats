import { describe, expect, it } from 'vitest';
import { createServices } from '@/server/container';
import type { DomainError, Result } from '@/server/domain/result';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function unwrap<T>(result: Result<T, DomainError>): T {
    if (!result.ok) {
        throw new Error(
            `expected ok result, got error: ${JSON.stringify(result.error)}`,
        );
    }
    return result.value;
}

/**
 * Shared seed for every case: one competition ('amnd') with two FINAL
 * seasons (2024, 2025) each with one tier-2 grade of 3 clubs, plus one
 * NON-FINAL 2026 season (excluded from `rankedYears` by `rankedYears()` in
 * coverage.ts, so it must never surface as the "latest" ranked year).
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

describe('rankings service', () => {
    it('returns the latest ranked season by default', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(await createServices(db).rankings.getPage({}));

        expect(result.season.year).toBe(2025);
    });

    it('falls back to latest when season is not ranked', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(
            await createServices(db).rankings.getPage({ season: 1999 }),
        );

        expect(result.season.year).toBe(2025);
    });

    it('honours a valid requested season', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(
            await createServices(db).rankings.getPage({ season: 2024 }),
        );

        expect(result.season.year).toBe(2024);
        // 2024 is the earliest ranked year in this seed, so there is no
        // ranked year before it to report as `previousYear`.
        expect(result.previousYear).toBeNull();
    });

    it('clamps an out-of-range page to the last page', async () => {
        const db = createTestDb();
        const spec = baseSpec();
        // Default page size is 50; seed 60 clubs into the 2025 grade so the
        // championship season spans more than one page. Without this, a
        // request for page 999 would resolve to page 1 whether or not the
        // clamp exists, since 3 rows always fit on a single page.
        const championshipGrade = spec.competitions[0]?.seasons.find(
            (season) => season.seasonKey === 'amnd-2025',
        )?.grades[0];
        if (championshipGrade === undefined) {
            throw new Error('expected amnd-2025-a1 grade in base spec');
        }
        const extraClubCount = 60;
        championshipGrade.teamCount = extraClubCount;
        championshipGrade.results = Array.from(
            { length: extraClubCount },
            (_unused, index) => {
                const clubKey = `extra-club-${String(index)}`;
                return {
                    clubKey,
                    clubName: `Extra Club ${String(index)}`,
                    displayName: `Extra Club ${String(index)}`,
                    ladderPosition: index + 1,
                };
            },
        );
        await seed(db, spec);

        const result = unwrap(
            await createServices(db).rankings.getPage({ page: 999 }),
        );

        const pageSize = result.tableState.pageSize;
        const expectedPageCount = Math.ceil(result.totalRows / pageSize);
        const expectedLastPageRows =
            result.totalRows - (expectedPageCount - 1) * pageSize;

        expect(result.tableState.page).toBe(expectedPageCount);
        expect(result.tableState.page).not.toBe(999);
        expect(result.season.rows.length).toBe(expectedLastPageRows);
    });

    it('rejects a sort column outside the allow-list', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(
            await createServices(db).rankings.getPage({ sort: 'evil' }),
        );

        expect(result.tableState.sort).toBe('rank');
    });
});
