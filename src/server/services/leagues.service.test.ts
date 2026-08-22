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
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                    },
                ],
            },
            {
                key: 'saucna',
                name: 'SAUCNA',
                seasons: [
                    {
                        grades: [
                            {
                                gradeKey: 'saucna-2024-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'falcons',
                                        clubName: 'Falcons',
                                        displayName: 'Falcons',
                                        ladderPosition: 1,
                                    },
                                ],
                                teamCount: 1,
                                tier: 1,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'saucna-2024',
                        startYear: 2024,
                    },
                ],
            },
        ],
    };
}

describe('leagues service', () => {
    it('lists seeded leagues and marks which ones score a championship', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const page = unwrap(await createServices(db).leagues.getIndexPage());
        const keys = page.leagues.map((entry) => entry.competition.key);
        expect(keys).toContain('amnd');
        expect(keys).toContain('saucna');
        expect(keys).toContain('sadna');
        expect(keys).toContain('hills');
        expect(keys).toContain('mid_hills');
        expect(keys).toContain('shna');
        expect(keys).toContain('gsna');
        expect(
            page.leagues.find((entry) => entry.competition.key === 'amnd')
                ?.hasChampionship,
        ).toBeTruthy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'saucna')
                ?.hasChampionship,
        ).toBeFalsy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'amnd')
                ?.seasonCount,
        ).toBe(1);
        expect(
            page.leagues.find((entry) => entry.competition.key === 'sadna')
                ?.hasPlayHqOrg,
        ).toBeFalsy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'hills')
                ?.hasPlayHqOrg,
        ).toBeFalsy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'mid_hills')
                ?.hasPlayHqOrg,
        ).toBeTruthy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'shna')
                ?.hasPlayHqOrg,
        ).toBeTruthy();
        expect(
            page.leagues.find((entry) => entry.competition.key === 'gsna')
                ?.hasPlayHqOrg,
        ).toBeTruthy();
    });

    it('scopes a league page to that competition’s clubs and rankings', async () => {
        const db = createTestDb();
        await seed(db, baseSpec());

        const amnd = unwrap(
            await createServices(db).leagues.getPage({
                competitionKey: 'amnd',
            }),
        );
        expect(amnd.competition.key).toBe('amnd');
        expect(amnd.hasChampionship).toBeTruthy();
        expect(
            amnd.clubs.map((entry) => entry.club.key).toSorted(),
        ).toStrictEqual(['contax', 'garville']);
        expect(amnd.season?.rows.map((row) => row.club.key)).toStrictEqual([
            'contax',
            'garville',
        ]);
        expect(amnd.grades.map((grade) => grade.key)).toStrictEqual([
            'amnd-2024-a1',
        ]);

        const saucna = unwrap(
            await createServices(db).leagues.getPage({
                competitionKey: 'saucna',
            }),
        );
        expect(saucna.hasChampionship).toBeFalsy();
        expect(saucna.season).toBeNull();
        expect(saucna.clubs.map((entry) => entry.club.key)).toStrictEqual([
            'falcons',
        ]);
        expect(saucna.grades.map((grade) => grade.key)).toStrictEqual([
            'saucna-2024-a1',
        ]);
    });

    it('keeps Premier League and Reserves on separate club lists', async () => {
        const db = createTestDb();
        await seed(db, {
            competitions: [
                {
                    key: 'premier_league',
                    name: 'Premier League',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'pl-2024-prem',
                                    name: 'Premier Division',
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax',
                                            ladderPosition: 1,
                                        },
                                    ],
                                    teamCount: 1,
                                    tier: 1,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'pl-2024',
                            startYear: 2024,
                        },
                    ],
                },
                {
                    key: 'premier_league_reserves',
                    name: 'Premier League Reserves',
                    seasons: [
                        {
                            grades: [
                                {
                                    gradeKey: 'plr-2024-res',
                                    name: 'Reserves Division',
                                    results: [
                                        {
                                            clubKey: 'contax',
                                            clubName: 'Contax',
                                            displayName: 'Contax Reserves',
                                            ladderPosition: 1,
                                        },
                                        {
                                            clubKey: 'matrics',
                                            clubName: 'Matrics',
                                            displayName: 'Matrics',
                                            ladderPosition: 2,
                                        },
                                    ],
                                    teamCount: 2,
                                    tier: 2,
                                },
                            ],
                            isFinal: true,
                            seasonKey: 'plr-2024',
                            startYear: 2024,
                        },
                    ],
                },
            ],
        });

        const premier = unwrap(
            await createServices(db).leagues.getPage({
                competitionKey: 'premier_league',
            }),
        );
        const reserves = unwrap(
            await createServices(db).leagues.getPage({
                competitionKey: 'premier_league_reserves',
            }),
        );
        expect(premier.clubs.map((entry) => entry.club.key)).toStrictEqual([
            'contax',
        ]);
        expect(
            reserves.clubs.map((entry) => entry.club.key).toSorted(),
        ).toStrictEqual(['contax', 'matrics']);
        expect(premier.grades.map((grade) => grade.key)).toStrictEqual([
            'pl-2024-prem',
        ]);
        expect(reserves.grades.map((grade) => grade.key)).toStrictEqual([
            'plr-2024-res',
        ]);
    });

    it('404s an unknown competition key', async () => {
        const db = createTestDb();
        const result = await createServices(db).leagues.getPage({
            competitionKey: 'nsw_hills',
        });
        expect(result.ok).toBeFalsy();
        expect(!result.ok && result.error).toStrictEqual({
            entity: 'competition',
            key: 'nsw_hills',
            kind: 'not-found',
        });
    });
});
