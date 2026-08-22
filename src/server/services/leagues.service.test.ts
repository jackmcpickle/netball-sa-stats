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
