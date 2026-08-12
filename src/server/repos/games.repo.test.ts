import { describe, expect, it } from 'vitest';
import type { Db } from '@/db';
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
                    seasonKey: `amnd-${String(year)}`,
                    startYear: year,
                    isFinal: year === 2025,
                    grades: [
                        {
                            gradeKey: `amnd-${String(year)}-a1`,
                            name: 'A1',
                            tier: 1,
                            teamCount: 3,
                            results: clubsInGrade.map((club, index) => ({
                                ...club,
                                ladderPosition: index + 1,
                            })),
                        },
                    ],
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
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                away: 'garville',
                round: 1,
                homeScore: 50,
                awayScore: 40,
            },
            {
                gradeKey: 'amnd-2025-a1',
                home: 'garville',
                away: 'contax',
                round: 8,
                homeScore: 45,
                awayScore: 44,
            },
        ]);

        const facts = await createGamesRepo(db).factsForPair(
            'contax',
            'garville',
        );
        expect(facts).toHaveLength(2);
        expect(facts.map((fact) => fact.homeClubKey)).toEqual([
            'contax',
            'garville',
        ]);
    });

    it('excludes a fixture against a third club', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { gradeKey: 'amnd-2025-a1', home: 'contax', away: 'matrics' },
        ]);

        expect(
            await createGamesRepo(db).factsForPair('contax', 'garville'),
        ).toEqual([]);
    });

    it('spans seasons, carrying each game year and tier', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { gradeKey: 'amnd-2025-a1', home: 'contax', away: 'garville' },
            { gradeKey: 'amnd-2026-a1', home: 'contax', away: 'garville' },
        ]);

        const facts = await createGamesRepo(db).factsForPair(
            'contax',
            'garville',
        );
        expect(
            [...facts]
                .map((fact) => fact.year)
                .sort((left, right) => left - right),
        ).toEqual([2025, 2026]);
        expect(facts.every((fact) => fact.tier === 1)).toBe(true);
    });

    it('is empty for a club paired with itself', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { gradeKey: 'amnd-2025-a1', home: 'contax', away: 'garville' },
        ]);

        expect(
            await createGamesRepo(db).factsForPair('contax', 'contax'),
        ).toEqual([]);
    });
});

describe('fetchGameFactsForGrade', () => {
    it('keeps a bye, which has only one side', async () => {
        // A left join, not inner: an inner join would drop the row entirely
        // and the grade's round list would have a hole in it.
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                gradeKey: 'amnd-2025-a1',
                home: 'matrics',
                away: null,
                status: 'bye',
            },
        ]);

        const facts = await createGamesRepo(db).factsForGrade('amnd-2025-a1');
        expect(facts).toHaveLength(1);
        expect(facts[0].homeClubKey).toBe('matrics');
        expect(facts[0].awayClubKey).toBeNull();
    });

    it('keeps a scheduled final with both sides undecided', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                gradeKey: 'amnd-2025-a1',
                home: null,
                away: null,
                round: 99,
                roundName: 'Grand Final',
                isFinals: true,
                status: 'scheduled',
            },
        ]);

        const facts = await createGamesRepo(db).factsForGrade('amnd-2025-a1');
        expect(facts).toHaveLength(1);
        expect(facts[0].isFinals).toBe(true);
        expect(facts[0].roundName).toBe('Grand Final');
        expect(facts[0].homeTeamName).toBeNull();
    });

    it('orders by round so finals fall after the last regular round', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                away: 'garville',
                round: 99,
                isFinals: true,
            },
            {
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                away: 'matrics',
                round: 2,
            },
        ]);

        const facts = await createGamesRepo(db).factsForGrade('amnd-2025-a1');
        expect(facts.map((fact) => fact.round)).toEqual([2, 99]);
    });

    it('excludes another grade, even in the same season', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { gradeKey: 'amnd-2026-a1', home: 'contax', away: 'garville' },
        ]);

        expect(await createGamesRepo(db).factsForGrade('amnd-2025-a1')).toEqual(
            [],
        );
    });
});

describe('fetchOpponentCounts', () => {
    it('counts games from either side of the fixture', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            { gradeKey: 'amnd-2025-a1', home: 'contax', away: 'garville' },
            { gradeKey: 'amnd-2025-a1', home: 'garville', away: 'contax' },
            { gradeKey: 'amnd-2025-a1', home: 'matrics', away: 'contax' },
        ]);

        const counts = await createGamesRepo(db).opponentCounts('contax');
        expect([...counts].sort((a, b) => b.played - a.played)).toEqual([
            { clubKey: 'garville', name: 'Garville', played: 2 },
            { clubKey: 'matrics', name: 'Matrics', played: 1 },
        ]);
    });

    it('ignores byes and unplayed games', async () => {
        const { db, seeded } = await setup();
        await seedGames(db, seeded, [
            {
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                away: null,
                status: 'bye',
            },
            {
                gradeKey: 'amnd-2025-a1',
                home: 'contax',
                away: 'garville',
                status: 'scheduled',
            },
        ]);

        expect(await createGamesRepo(db).opponentCounts('contax')).toEqual([]);
    });

    it('is empty for a club with no fixtures', async () => {
        const { db } = await setup();
        expect(await createGamesRepo(db).opponentCounts('contax')).toEqual([]);
    });
});
