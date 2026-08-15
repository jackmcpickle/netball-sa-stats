import { describe, expect, it } from 'vitest';
import { buildHeadToHead, topOpponents } from '@/server/domain/head-to-head';
import type { GameFact } from '@/server/dto/head-to-head.dto';

function fact(overrides: Partial<GameFact>): GameFact {
    return {
        awayClubKey: 'b',
        awayScore: 40,
        awayTeamName: 'B',
        gradeName: 'Premier Division',
        homeClubKey: 'a',
        homeScore: 50,
        homeTeamName: 'A',
        isFinals: false,
        playedAt: null,
        round: 1,
        roundName: 'Round 1',
        status: 'final',
        tier: 1,
        year: 2025,
        ...overrides,
    };
}

describe(buildHeadToHead, () => {
    it('counts a home win for club A', () => {
        const h2h = buildHeadToHead([fact({})], 'a', 'b', 'all');
        expect(h2h.record).toStrictEqual({
            drawn: 0,
            goalsAgainst: 40,
            goalsFor: 50,
            lost: 0,
            played: 1,
            won: 1,
        });
    });

    it('normalises an away game to club A perspective', () => {
        // Same scoreline, sides swapped: A must still be the loser here.
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: 'a', homeClubKey: 'b' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.lost).toBe(1);
        expect(h2h.record.goalsFor).toBe(40);
    });

    it('swaps team names alongside the scores', () => {
        const h2h = buildHeadToHead(
            [
                fact({
                    awayClubKey: 'a',
                    awayTeamName: 'A 2',
                    homeClubKey: 'b',
                    homeTeamName: 'B 1',
                }),
            ],
            'a',
            'b',
            'all',
        );
        expect(h2h.meetings[0].teamA).toBe('A 2');
        expect(h2h.meetings[0].teamB).toBe('B 1');
    });

    it('counts a forfeit as a result', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: 0, homeScore: 20, status: 'forfeit' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(1);
        expect(h2h.record.won).toBe(1);
    });

    it('never counts forfeit goals, which PlayHQ fabricates as 0-20', () => {
        // A phantom 20-goal margin in every differential otherwise.
        const h2h = buildHeadToHead(
            [fact({ awayScore: 0, homeScore: 20, status: 'forfeit' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.goalsFor).toBe(0);
        expect(h2h.record.goalsAgainst).toBe(0);
    });

    it('excludes a no-result from the record but keeps it in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: null, homeScore: null, status: 'no_result' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toHaveLength(1);
        expect(h2h.meetings[0].result).toBeNull();
    });

    it('excludes scheduled games from the record but keeps them in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: null, homeScore: null, status: 'scheduled' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toHaveLength(1);
    });

    it('counts a draw', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: 44, homeScore: 44 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.drawn).toBe(1);
        expect(h2h.meetings[0].result).toBe('D');
    });

    it('returns an empty record when the clubs have never met', () => {
        const h2h = buildHeadToHead([], 'a', 'b', 'all');
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toStrictEqual([]);
        expect(h2h.bySeason).toStrictEqual([]);
        expect(h2h.byBand).toStrictEqual([]);
    });

    it('ignores games involving neither club', () => {
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: 'd', homeClubKey: 'c' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('ignores games where only one of the two clubs appears', () => {
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: 'c' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
    });

    it('never counts an intra-club game', () => {
        // A cannot play A; a same-club fixture must not become a phantom meeting.
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: 'a', homeClubKey: 'a' })],
            'a',
            'a',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toStrictEqual([]);
    });

    it('filters to a single band without disturbing other bands', () => {
        const facts = [
            fact({ tier: 1 }),
            fact({
                awayScore: 30,
                gradeName: 'Junior 2',
                homeScore: 10,
                tier: 4,
            }),
        ];
        expect(buildHeadToHead(facts, 'a', 'b', 1).record.played).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 1).record.won).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 4).record.lost).toBe(1);
        expect(buildHeadToHead(facts, 'a', 'b', 'all').record.played).toBe(2);
    });

    it('rolls up by band, strongest tier first', () => {
        const h2h = buildHeadToHead(
            [fact({ tier: 4 }), fact({ tier: 1 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.byBand.map((band) => band.tier)).toStrictEqual([1, 4]);
        expect(h2h.byBand[0].played).toBe(1);
    });

    it('rolls up by season ascending, newest first in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ year: 2024 }), fact({ year: 2026 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.bySeason.map((s) => s.year)).toStrictEqual([2024, 2026]);
        expect(h2h.meetings[0].year).toBe(2026);
    });

    it('orders meetings within a season by round, latest first', () => {
        const h2h = buildHeadToHead(
            [fact({ round: 3 }), fact({ round: 12 }), fact({ round: 7 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.meetings.map((m) => m.round)).toStrictEqual([12, 7, 3]);
    });

    it('carries the season goal differential from A perspective', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: 40, homeScore: 50 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.bySeason[0].goalDiff).toBe(10);
    });

    it('excludes byes, which have only one side', () => {
        const h2h = buildHeadToHead(
            [fact({ awayClubKey: null, awayScore: null, status: 'bye' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toStrictEqual([]);
    });

    it('omits goals for a game with no recorded score', () => {
        const h2h = buildHeadToHead(
            [fact({ awayScore: null, homeScore: null, status: 'forfeit' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.goalsFor).toBe(0);
        expect(h2h.record.goalsAgainst).toBe(0);
    });

    it('keeps the finals label so a final never renders as a round number', () => {
        const h2h = buildHeadToHead(
            [fact({ isFinals: true, round: 99, roundName: 'Grand Final' })],
            'a',
            'b',
            'all',
        );
        expect(h2h.meetings[0].isFinals).toBeTruthy();
        expect(h2h.meetings[0].roundName).toBe('Grand Final');
    });
});

describe(topOpponents, () => {
    it('orders by games played then name, so ties are stable', () => {
        expect(
            topOpponents([
                { clubKey: 'b', name: 'Bravo', played: 3 },
                { clubKey: 'c', name: 'Charlie', played: 9 },
                { clubKey: 'a', name: 'Alpha', played: 3 },
            ]),
        ).toStrictEqual([
            { clubKey: 'c', name: 'Charlie', played: 9 },
            { clubKey: 'a', name: 'Alpha', played: 3 },
            { clubKey: 'b', name: 'Bravo', played: 3 },
        ]);
    });

    it('is empty for a club with no games', () => {
        expect(topOpponents([])).toStrictEqual([]);
    });
});
