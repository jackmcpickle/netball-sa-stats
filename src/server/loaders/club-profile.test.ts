import { describe, expect, it } from 'vitest';
import { loadClubProfileData } from '@/server/loaders/club-profile';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/**
 * One competition ('amnd') with two FINAL seasons (2024, 2025), each a
 * single tier-2 grade. 'contax' finishes 1st both seasons — 1st of 3 in
 * 2024, 1st of 2 in 2025 — so it has results (and championship rank) in
 * both seasons, giving the club-profile loader real career data to roll up.
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

describe('loadClubProfileData', () => {
    it('returns null for an unknown club key', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadClubProfileData(db, { clubKey: 'nobody' });

        expect(result).toBeNull();
    });

    it('returns the profile with paginated results for a known club', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const result = await loadClubProfileData(db, { clubKey: 'contax' });

        expect(result).not.toBeNull();
        // teamPoints = (teamCount - ladderPosition + 1) * weight (weight 1):
        // 2024 -> (3 - 1 + 1) = 3, 2025 -> (2 - 1 + 1) = 2. Rank is 1 both
        // seasons since contax has the most points each year.
        expect(result?.profile.currentRank).toBe(1);
        expect(result?.profile.bestRank).toBe(1);
        expect(result?.profile.bestRankYear).toBe(2024);
        expect(result?.profile.careerPoints).toBe(5);
        // Ladder position 1, not position-uncertain, in both seasons.
        expect(result?.profile.minorPremierships).toBe(2);
        // No won/lost/drawn counts were seeded, so there is no record to
        // compute a win percentage from — null, not 0%.
        expect(result?.profile.winPercentage).toBeNull();
        expect(result?.profile.results.length).toBe(2);
        expect(result?.profile.totalRows).toBe(2);
        expect(result?.profile.tableState.page).toBe(1);
        // clubs is every club in the db, not just the profiled one.
        expect(result?.clubs.map((club) => club.key).sort()).toEqual([
            'ajax',
            'contax',
            'garville',
        ]);
    });

    it('clamps page and reports pre-slice totalRows', async () => {
        const db = createTestDb();
        const spec: SeedSpec = {
            competitions: [{ key: 'amnd', name: 'AMND', seasons: [] }],
        };
        const competition = spec.competitions[0];
        if (competition === undefined) {
            throw new Error('expected amnd competition in spec');
        }
        // Default page size is 50; seed 60 seasons each with one grade, so
        // 'contax' racks up 60 result rows and spans more than one page.
        // Without this, page 999 would resolve to page 1 whether or not the
        // clamp exists, since a handful of rows always fit on one page.
        const extraSeasonCount = 60;
        competition.seasons = Array.from(
            { length: extraSeasonCount },
            (_unused, index) => {
                const year = 1960 + index;
                const seasonKey = `amnd-${String(year)}`;
                const gradeKey = `${seasonKey}-a1`;
                return {
                    seasonKey,
                    startYear: year,
                    isFinal: true,
                    grades: [
                        {
                            gradeKey,
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
                                    clubKey: 'filler',
                                    clubName: 'Filler',
                                    displayName: 'Filler',
                                    ladderPosition: 2,
                                },
                            ],
                        },
                    ],
                };
            },
        );
        await seed(db, spec);

        const result = await loadClubProfileData(db, {
            clubKey: 'contax',
            page: 999,
        });

        expect(result).not.toBeNull();
        const totalRows = result?.profile.totalRows ?? 0;
        expect(totalRows).toBe(extraSeasonCount);
        const pageSize = result?.profile.tableState.pageSize ?? 0;
        const expectedPageCount = Math.ceil(totalRows / pageSize);
        const expectedLastPageRows =
            totalRows - (expectedPageCount - 1) * pageSize;

        expect(result?.profile.tableState.page).toBe(expectedPageCount);
        expect(result?.profile.tableState.page).not.toBe(999);
        expect(result?.profile.results.length).toBe(expectedLastPageRows);
    });
});
