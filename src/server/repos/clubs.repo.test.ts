import { describe, expect, it } from 'vitest';
import { CLUB_RESULTS_TABLE_SPEC } from '@/db/queries/club-profile';
import type { PageRequest } from '@/server/domain/table-query';
import { TableQuery } from '@/server/domain/table-query';
import { createClubsRepo } from '@/server/repos/clubs.repo';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/**
 * Two final seasons, contax finishing 1st both times — 1st of 3 in 2024, 1st
 * of 2 in 2025 — so it has real career data to roll up, and two result rows
 * to page through.
 */
function careerSpec(): SeedSpec {
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

/** A page large enough to hold any club history these tests seed. */
function wholeHistory(sort: string, dir: 'asc' | 'desc'): PageRequest {
    return TableQuery.from(
        { sort, dir, pageSize: 100 },
        CLUB_RESULTS_TABLE_SPEC,
    ).request();
}

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

describe(createClubsRepo, () => {
    it('all() lists every club, alphabetically by name', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const clubs = await createClubsRepo(db).all();

        expect(clubs.map((club) => club.key)).toStrictEqual([
            'contax',
            'garville',
        ]);
    });

    it('all() over an empty database is an empty collection', async () => {
        const db = createTestDb();

        const clubs = await createClubsRepo(db).all();

        expect(clubs).toStrictEqual([]);
    });

    it('profile() rolls up career stats across seasons for a known club', async () => {
        const db = createTestDb();
        // Two final seasons, contax finishing 1st both times — 1st of 3 in
        // 2024, 1st of 2 in 2025 — so it has real career data to roll up.
        const spec = careerSpec();
        await seed(db, spec);

        const profile = await createClubsRepo(db).profile('contax');

        expect(profile).not.toBeNull();
        // teamPoints = (teamCount - ladderPosition + 1) * weight (weight 1):
        // 2024 -> (3 - 1 + 1) = 3, 2025 -> (2 - 1 + 1) = 2. Rank is 1 both
        // seasons since contax has the most points each year.
        expect(profile?.currentRank).toBe(1);
        expect(profile?.bestRank).toBe(1);
        expect(profile?.bestRankYear).toBe(2024);
        expect(profile?.careerPoints).toBe(5);
        // Ladder position 1, not position-uncertain, in both seasons.
        expect(profile?.minorPremierships).toBe(2);
        // No won/lost/drawn counts were seeded, so there is no record to
        // compute a win percentage from — null, not 0%.
        expect(profile?.winPercentage).toBeNull();
    });

    it('countResults() counts every finish the club has', async () => {
        const db = createTestDb();
        await seed(db, careerSpec());

        const repo = createClubsRepo(db);
        await expect(repo.countResults('contax')).resolves.toBe(2);
        await expect(repo.countResults('nobody')).resolves.toBe(0);
    });

    it('resultsPage() defaults to newest season first', async () => {
        const db = createTestDb();
        await seed(db, careerSpec());

        const rows = await createClubsRepo(db).resultsPage(
            'contax',
            wholeHistory('year', 'desc'),
        );
        expect(rows.map((row) => row.year)).toStrictEqual([2025, 2024]);
    });

    it('resultsPage() sorts on an allow-listed column', async () => {
        const db = createTestDb();
        await seed(db, careerSpec());

        const rows = await createClubsRepo(db).resultsPage(
            'contax',
            wholeHistory('year', 'asc'),
        );
        expect(rows.map((row) => row.year)).toStrictEqual([2024, 2025]);
    });

    it('resultsPage() slices to the requested page', async () => {
        // Consecutive pages must not repeat or lose a row.
        const db = createTestDb();
        await seed(db, careerSpec());

        const repo = createClubsRepo(db);
        const base = wholeHistory('year', 'desc');
        const first = await repo.resultsPage('contax', {
            ...base,
            limit: 1,
            offset: 0,
        });
        const second = await repo.resultsPage('contax', {
            ...base,
            limit: 1,
            offset: 1,
        });
        expect(first.map((row) => row.year)).toStrictEqual([2025]);
        expect(second.map((row) => row.year)).toStrictEqual([2024]);
    });

    it('profile() returns null for an unknown club key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const profile = await createClubsRepo(db).profile('nobody');

        expect(profile).toBeNull();
    });
});
