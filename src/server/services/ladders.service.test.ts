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

describe('ladders service', () => {
    it('defaults to the latest season and its first grade', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = unwrap(await createServices(db).ladders.getPage({}));

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

        const result = unwrap(
            await createServices(db).ladders.getPage({
                year: 2024,
                grade: 'does-not-exist',
            }),
        );

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

        const result = unwrap(
            await createServices(db).ladders.getPage({ year: 2023 }),
        );

        expect(result.year).toBe(2023);
        expect(result.grades).toHaveLength(0);
        expect(result.ladder).toBeNull();
    });

    it('SWALLOWS a grade not-found error from the repo and renders an empty ladder', async () => {
        // Documents CURRENT (undesirable) behaviour, per review: when
        // `repos.grades.ladder(gradeKey)` returns a genuine `not-found`
        // (e.g. the grade row exists but has zero results), the service
        // discards the error entirely and falls through to the same
        // `ladder: null` empty state as "no grades at all" — the caller
        // gets no signal that something went wrong versus there being
        // nothing to show. Do not "fix" this without discussing with the
        // team; the fix round explicitly asked to leave behaviour as-is
        // and only document it here.
        const db = createTestDb();
        const spec = baseSpec();
        const gradeWithNoResults = spec.competitions[0]?.seasons.find(
            (season) => season.seasonKey === 'amnd-2024',
        )?.grades[0];
        if (gradeWithNoResults === undefined) {
            throw new Error('expected amnd-2024-a1 grade in base spec');
        }
        gradeWithNoResults.results = [];
        await seed(db, spec);

        const result = unwrap(
            await createServices(db).ladders.getPage({ year: 2024 }),
        );

        // The grade is listed (it came from the `grades` table)...
        expect(result.grades).toHaveLength(1);
        expect(result.grades[0]?.key).toBe('amnd-2024-a1');
        // ...but the ladder itself silently disappears instead of
        // surfacing the underlying not-found.
        expect(result.ladder).toBeNull();
    });

    it('returns an empty dataset shape for a completely empty database', async () => {
        const db = createTestDb();

        const result = unwrap(await createServices(db).ladders.getPage({}));

        expect(result.year).toBeNull();
        expect(result.years).toStrictEqual([]);
        expect(result.grades).toStrictEqual([]);
        expect(result.ladder).toBeNull();
    });
});
