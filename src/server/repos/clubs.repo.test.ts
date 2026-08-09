import { describe, expect, it } from 'vitest';
import { TableQuery } from '@/server/domain/table-query';
import { createClubsRepo } from '@/server/repos/clubs.repo';
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
                                tier: 1,
                                teamCount: 2,
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
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('createClubsRepo', () => {
    it('all() lists every club, alphabetically by name', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const clubs = await createClubsRepo(db).all();

        expect(clubs.map((club) => club.key)).toEqual(['contax', 'garville']);
    });

    it('all() over an empty database is an empty collection', async () => {
        const db = createTestDb();

        const clubs = await createClubsRepo(db).all();

        expect(clubs).toEqual([]);
    });

    it('historyOf() builds a ClubHistory from the club’s results', async () => {
        const db = createTestDb();
        // Two final seasons for contax (plus a rival club, garville, in
        // both), so a broken fetchResults filter (e.g. one that leaks
        // garville's rows or drops a season) or a wrong rankedYears
        // passthrough would fail this test.
        const spec: SeedSpec = {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [
                        {
                            seasonKey: 'amnd-2023',
                            startYear: 2023,
                            isFinal: true,
                            grades: [
                                {
                                    gradeKey: 'amnd-2023-a1',
                                    name: 'A1',
                                    tier: 1,
                                    teamCount: 2,
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 3,
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 1,
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            seasonKey: 'amnd-2024',
                            startYear: 2024,
                            isFinal: true,
                            grades: [
                                {
                                    gradeKey: 'amnd-2024-a1',
                                    name: 'A1',
                                    tier: 1,
                                    teamCount: 2,
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
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        await seed(db, spec);

        const result = await createClubsRepo(db).historyOf('contax');

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.clubData().key).toBe('contax');
        expect(result.value.clubData().name).toBe('Contax');

        // sortedResults() exposes the raw rows the ClubHistory was built
        // from (most recent season first): only contax's own two seasons,
        // never garville's rows, with the concrete ladder positions from
        // each season.
        const q = TableQuery.from(
            { sort: 'year', dir: 'desc' },
            {
                sortable: ['year'],
                defaultSort: 'year',
                defaultDesc: true,
            },
        );
        const { rows, totalRows } = result.value.sortedResults(q);
        expect(totalRows).toBe(2);
        expect(rows.map((row) => row.year)).toEqual([2024, 2023]);
        expect(rows.map((row) => row.ladderPosition)).toEqual([1, 3]);

        // Both seasons are final, so both are ranked.
        expect(result.value.trend().overall.map((point) => point.year)).toEqual(
            [2023, 2024],
        );
    });

    it('historyOf() returns not-found for an unknown club key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await createClubsRepo(db).historyOf('nobody');

        expect(result).toEqual({
            ok: false,
            error: { kind: 'not-found', entity: 'club', key: 'nobody' },
        });
    });
});
