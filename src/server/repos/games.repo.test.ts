import { isNull } from 'es-toolkit';
import { describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import type { PageRequest } from '@/server/domain/table-query';
import { TableQuery } from '@/server/domain/table-query';
import { createGamesRepo } from '@/server/repos/games.repo';
import type { SeedResult, SeedSpec } from '@/server/testing/fixtures';
import { seed, seedGames } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

/**
 * Two seasons of one grade, three clubs, so a pair query has to reject a
 * third club's fixtures and span more than one year.
 */
function baseSpec(): SeedSpec {
    const clubsInGrade = [
        { clubKey: 'contax', clubName: 'Contax', displayName: 'Contax' },
        { clubKey: 'garville', clubName: 'Garville', displayName: 'Garville' },
        { clubKey: 'matrics', clubName: 'Matrics', displayName: 'Matrics' },
    ];
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [2025, 2026].map((year) => ({
                    grades: [
                        {
                            gradeKey: `amnd-${String(year)}-a1`,
                            name: 'A1',
                            results: clubsInGrade.map((club, index) => ({
                                ...club,
                                ladderPosition: index + 1,
                            })),
                            teamCount: 3,
                            tier: 1,
                        },
                    ],
                    isFinal: year === 2025,
                    seasonKey: `amnd-${String(year)}`,
                    startYear: year,
                })),
            },
        ],
    };
}

async function setup(): Promise<{ db: Db; seeded: SeedResult }> {
    const db = createTestDb();
    const seeded = await seed(db, baseSpec());
    return { db, seeded };
}

describe('fetchGameFactsForPair', () => {
    it('returns both legs of a fixture regardless of which side is home', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: 'garville',
                awayScore: 40,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 50,
                round: 1,
            },
            {
                away: 'contax',
                awayScore: 44,
                gradeKey: 'amnd-2025-a1',
                home: 'garville',
                homeScore: 45,
                round: 8,
            },
        ]);

        const facts = await createGamesRepo(db).factsForPair(
            'contax',
            'garville',
        );
        expect(facts).toHaveLength(2);
        expect(facts.map((fact) => fact.homeClubKey)).toStrictEqual([
            'contax',
            'garville',
        ]);
    });

    it('excludes a fixture against a third club', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { away: 'matrics', gradeKey: 'amnd-2025-a1', home: 'contax' },
        ]);

        await expect(
            createGamesRepo(db).factsForPair('contax', 'garville'),
        ).resolves.toStrictEqual([]);
    });

    it('spans seasons, carrying each game year and tier', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { away: 'garville', gradeKey: 'amnd-2025-a1', home: 'contax' },
            { away: 'garville', gradeKey: 'amnd-2026-a1', home: 'contax' },
        ]);

        const facts = await createGamesRepo(db).factsForPair(
            'contax',
            'garville',
        );
        expect(
            facts
                .map((fact) => fact.year)
                .toSorted((left, right) => left - right),
        ).toStrictEqual([2025, 2026]);
        expect(facts.every((fact) => fact.tier === 1)).toBeTruthy();
    });

    it('is empty for a club paired with itself', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { away: 'garville', gradeKey: 'amnd-2025-a1', home: 'contax' },
        ]);

        await expect(
            createGamesRepo(db).factsForPair('contax', 'contax'),
        ).resolves.toStrictEqual([]);
    });
});

const GRADE_SPEC = {
    defaultDesc: false,
    defaultSort: 'round',
    sortable: ['round', 'playedAt', 'home', 'away', 'margin'],
} as const;

/** A page big enough to hold any fixture set these tests seed. */
function wholeGrade(): PageRequest {
    return TableQuery.from({ pageSize: 100 }, GRADE_SPEC).request();
}

describe('fetchGamePageForGrade', () => {
    it('keeps a bye, which has only one side', async () => {
        // A left join, not inner: an inner join would drop the row entirely
        // and the grade's round list would have a hole in it.
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: null,
                gradeKey: 'amnd-2025-a1',
                home: 'matrics',
                status: 'bye',
            },
        ]);

        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            wholeGrade(),
        );
        expect(facts).toHaveLength(1);
        expect(facts[0].homeClubKey).toBe('matrics');
        expect(facts[0].awayClubKey).toBeNull();
    });

    it('keeps a scheduled final with both sides undecided', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: null,
                gradeKey: 'amnd-2025-a1',
                home: null,
                isFinals: true,
                round: 99,
                roundName: 'Grand Final',
                status: 'scheduled',
            },
        ]);

        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            wholeGrade(),
        );
        expect(facts).toHaveLength(1);
        expect(facts[0].isFinals).toBeTruthy();
        expect(facts[0].roundName).toBe('Grand Final');
        expect(facts[0].homeTeamName).toBeNull();
    });

    it('orders by round so finals fall after the last regular round', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: 'garville',
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                isFinals: true,
                round: 99,
            },
            {
                away: 'matrics',
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                round: 2,
            },
        ]);

        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            wholeGrade(),
        );
        expect(facts.map((fact) => fact.round)).toStrictEqual([2, 99]);
    });

    it('excludes another grade, even in the same season', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { away: 'garville', gradeKey: 'amnd-2026-a1', home: 'contax' },
        ]);

        await expect(
            createGamesRepo(db).pageForGrade('amnd-2025-a1', wholeGrade()),
        ).resolves.toStrictEqual([]);
    });
});

describe('fetchOpponentCounts', () => {
    it('counts games from either side of the fixture', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { away: 'garville', gradeKey: 'amnd-2025-a1', home: 'contax' },
            { away: 'contax', gradeKey: 'amnd-2025-a1', home: 'garville' },
            { away: 'contax', gradeKey: 'amnd-2025-a1', home: 'matrics' },
        ]);

        const counts = await createGamesRepo(db).opponentCounts('contax');
        expect(counts.toSorted((a, b) => b.played - a.played)).toStrictEqual([
            { clubKey: 'garville', name: 'Garville', played: 2 },
            { clubKey: 'matrics', name: 'Matrics', played: 1 },
        ]);
    });

    it('ignores byes and unplayed games', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: null,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                status: 'bye',
            },
            {
                away: 'garville',
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                status: 'scheduled',
            },
        ]);

        await expect(
            createGamesRepo(db).opponentCounts('contax'),
        ).resolves.toStrictEqual([]);
    });

    it('is empty for a club with no fixtures', async () => {
        const { db } = await setup();
        await expect(
            createGamesRepo(db).opponentCounts('contax'),
        ).resolves.toStrictEqual([]);
    });
});

describe('fetchGamePageForGrade paging and sorting', () => {
    function request(sort: string, dir: 'asc' | 'desc'): PageRequest {
        return TableQuery.from({ dir, sort }, GRADE_SPEC).request();
    }

    async function withFixtures(): Promise<Db> {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                away: 'garville',
                awayScore: 32,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 50,
                playedAt: 200,
                round: 2,
            },
            {
                away: 'matrics',
                awayScore: 39,
                gradeKey: 'amnd-2025-a1',
                home: 'garville',
                homeScore: 40,
                playedAt: 100,
                round: 1,
            },
            {
                away: null,
                gradeKey: 'amnd-2025-a1',
                home: 'matrics',
                round: 3,
                status: 'bye',
            },
            {
                away: 'matrics',
                awayScore: 0,
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                homeScore: 20,
                round: 4,
                status: 'forfeit',
            },
        ]);
        return db;
    }

    it('counts every fixture in the grade, including byes', async () => {
        const db = await withFixtures();
        await expect(
            createGamesRepo(db).countForGrade('amnd-2025-a1'),
        ).resolves.toBe(4);
    });

    it('counts nothing for a grade with no fixtures', async () => {
        const { db } = await setup();
        await expect(
            createGamesRepo(db).countForGrade('amnd-2025-a1'),
        ).resolves.toBe(0);
    });

    it('orders by round ascending by default', async () => {
        const db = await withFixtures();
        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            request('round', 'asc'),
        );
        expect(facts.map((fact) => fact.round)).toStrictEqual([1, 2, 3, 4]);
    });

    it('sorts by a derived margin, computed in SQL', async () => {
        const db = await withFixtures();
        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            request('margin', 'desc'),
        );
        // 18 then 1; the bye and the forfeit have no margin at all.
        expect(facts.slice(0, 2).map((fact) => fact.round)).toStrictEqual([
            2, 1,
        ]);
    });

    it('sorts a fabricated forfeit scoreline last, not as a 20-goal win', async () => {
        // PlayHQ writes 0-20 on a forfeit. Treating that as a margin would
        // put a game nobody played at the top of the biggest-wins view.
        const db = await withFixtures();
        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            request('margin', 'desc'),
        );
        expect(facts.at(-1)?.status).toBeOneOf(['bye', 'forfeit']);
        expect(
            facts
                .slice(-2)
                .map((fact) => fact.status)
                .toSorted(),
        ).toStrictEqual(['bye', 'forfeit']);
    });

    it('keeps rows without a value last whichever way the column points', async () => {
        const db = await withFixtures();
        const repo = createGamesRepo(db);
        for (const dir of ['asc', 'desc'] as const) {
            // eslint-disable-next-line no-await-in-loop -- two directions, in order
            const facts = await repo.pageForGrade(
                'amnd-2025-a1',
                request('playedAt', dir),
            );
            expect(
                facts.slice(-2).every((fact) => isNull(fact.playedAt)),
            ).toBeTruthy();
        }
    });

    it('sorts by team name', async () => {
        const db = await withFixtures();
        const facts = await createGamesRepo(db).pageForGrade(
            'amnd-2025-a1',
            request('home', 'asc'),
        );
        expect(facts.map((fact) => fact.homeTeamName)).toStrictEqual([
            'Contax',
            'Contax',
            'Garville',
            'Matrics',
        ]);
    });

    it('slices to the requested page without repeating or losing a row', async () => {
        const db = await withFixtures();
        const repo = createGamesRepo(db);
        const base = request('round', 'asc');
        const first = await repo.pageForGrade('amnd-2025-a1', {
            ...base,
            limit: 2,
            offset: 0,
        });
        const second = await repo.pageForGrade('amnd-2025-a1', {
            ...base,
            limit: 2,
            offset: 2,
        });
        expect(first.map((fact) => fact.round)).toStrictEqual([1, 2]);
        expect(second.map((fact) => fact.round)).toStrictEqual([3, 4]);
    });

    it('excludes another grade', async () => {
        const db = await withFixtures();
        await expect(
            createGamesRepo(db).countForGrade('amnd-2026-a1'),
        ).resolves.toBe(0);
    });
});
