import { describe, expect, it } from 'vitest';
import { fetchClubProfile } from '@/db/queries/club-profile';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

describe(fetchClubProfile, () => {
    it('reports a null career record (not a 0% win rate) when no result has a W/L/D count', async () => {
        const db = createTestDb();
        const spec: SeedSpec = {
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
                                            // No won/lost/drawn given: the
                                            // row has a ladder finish but no
                                            // recorded W/L/D.
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2024',
                            startYear: 2024,
                        },
                    ],
                },
            ],
        };
        await seed(db, spec);

        const profile = await fetchClubProfile(db, 'contax');

        expect(profile).not.toBeNull();
        expect(profile?.winPercentage).toBeNull();
        expect(profile?.gamesPlayed).toBe(0);
    });

    it('marks a covered but non-final season "in-progress" rather than ranked', async () => {
        const db = createTestDb();
        const spec: SeedSpec = {
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
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
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
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
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
        await seed(db, spec);

        const profile = await fetchClubProfile(db, 'contax');

        expect(profile).not.toBeNull();
        const season2025 = profile?.seasons.find(
            (season) => season.year === 2025,
        );
        expect(season2025).toStrictEqual({
            points: 0,
            rank: null,
            status: 'in-progress',
            year: 2025,
        });
        const season2024 = profile?.seasons.find(
            (season) => season.year === 2024,
        );
        expect(season2024?.status).toBe('ranked');
    });

    it('ranks a championship year even while a non-championship season that started that year is still running', async () => {
        const db = createTestDb();
        const spec: SeedSpec = {
            competitions: [
                {
                    key: 'amnd',
                    name: 'AMND',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'amnd-2026-a1',
                                    name: 'A1',
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
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'amnd-2026',
                            startYear: 2026,
                        },
                    ],
                },
                {
                    key: 'city_night_division',
                    name: 'City Night Division',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'cnd-2026-a1',
                                    name: 'A1',
                                    results: [
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 1,
                                },
                            ],
                            isFinal: false,
                            seasonKey: 'cnd-2026',
                            startYear: 2026,
                        },
                    ],
                },
            ],
        };
        await seed(db, spec);

        const profile = await fetchClubProfile(db, 'contax');

        expect(
            profile?.seasons.find((season) => season.year === 2026)?.status,
        ).toBe('ranked');
    });

    it('plots strength for a finished non-championship season', async () => {
        const db = createTestDb();
        const spec: SeedSpec = {
            competitions: [
                {
                    key: 'saucna',
                    name: 'SAUCNA',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'saucna-2026-a1',
                                    name: 'A1',
                                    results: [
                                        {
                                            clubKey: 'lutheran',
                                            clubName: 'Lutheran',
                                            displayName: 'Lutheran',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 1,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'saucna-2026',
                            startYear: 2026,
                        },
                    ],
                },
                {
                    key: 'city_night_division',
                    name: 'City Night Division',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'cnd-2026-a1',
                                    name: 'A1',
                                    results: [
                                        {
                                            clubKey: 'garville',
                                            clubName: 'Garville',
                                            displayName: 'Garville',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 1,
                                },
                            ],
                            isFinal: false,
                            seasonKey: 'cnd-2026',
                            startYear: 2026,
                        },
                    ],
                },
            ],
        };
        await seed(db, spec);

        const profile = await fetchClubProfile(db, 'lutheran');

        expect(
            profile?.trend.overall.find((point) => point.year === 2026),
        ).toStrictEqual({ strength: 1, teams: 1, year: 2026 });
    });
});
