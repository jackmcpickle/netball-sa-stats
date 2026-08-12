import { describe, expect, it } from 'vitest';
import { buildHeadToHead, topOpponents } from '@/server/domain/head-to-head';
import type { GameFact } from '@/server/dto/head-to-head.dto';

function fact(overrides: Partial<GameFact>): GameFact {
    return {
        year: 2025,
        tier: 1,
        gradeName: 'Premier Division',
        round: 1,
        roundName: 'Round 1',
        isFinals: false,
        playedAt: null,
        homeClubKey: 'a',
        awayClubKey: 'b',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 50,
        awayScore: 40,
        status: 'final',
        ...overrides,
    };
}

describe('buildHeadToHead', () => {
    it('counts a home win for club A', () => {
        const h2h = buildHeadToHead([fact({})], 'a', 'b', 'all');
        expect(h2h.record).toEqual({
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 50,
            goalsAgainst: 40,
        });
    });

    it('normalises an away game to club A perspective', () => {
        // Same scoreline, sides swapped: A must still be the loser here.
        const h2h = buildHeadToHead(
            [fact({ homeClubKey: 'b', awayClubKey: 'a' })],
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
                    homeClubKey: 'b',
                    awayClubKey: 'a',
                    homeTeamName: 'B 1',
                    awayTeamName: 'A 2',
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
            [fact({ status: 'forfeit', homeScore: 20, awayScore: 0 })],
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
            [fact({ status: 'forfeit', homeScore: 20, awayScore: 0 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.goalsFor).toBe(0);
        expect(h2h.record.goalsAgainst).toBe(0);
    });

    it('excludes a no-result from the record but keeps it in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'no_result', homeScore: null, awayScore: null })],
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
            [fact({ status: 'scheduled', homeScore: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toHaveLength(1);
    });

    it('counts a draw', () => {
        const h2h = buildHeadToHead(
            [fact({ homeScore: 44, awayScore: 44 })],
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
        expect(h2h.meetings).toEqual([]);
        expect(h2h.bySeason).toEqual([]);
        expect(h2h.byBand).toEqual([]);
    });

    it('ignores games involving neither club', () => {
        const h2h = buildHeadToHead(
            [fact({ homeClubKey: 'c', awayClubKey: 'd' })],
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
            [fact({ homeClubKey: 'a', awayClubKey: 'a' })],
            'a',
            'a',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toEqual([]);
    });

    it('filters to a single band without disturbing other bands', () => {
        const facts = [
            fact({ tier: 1 }),
            fact({
                tier: 4,
                gradeName: 'Junior 2',
                homeScore: 10,
                awayScore: 30,
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
        expect(h2h.byBand.map((band) => band.tier)).toEqual([1, 4]);
        expect(h2h.byBand[0].played).toBe(1);
    });

    it('rolls up by season ascending, newest first in meetings', () => {
        const h2h = buildHeadToHead(
            [fact({ year: 2024 }), fact({ year: 2026 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.bySeason.map((s) => s.year)).toEqual([2024, 2026]);
        expect(h2h.meetings[0].year).toBe(2026);
    });

    it('orders meetings within a season by round, latest first', () => {
        const h2h = buildHeadToHead(
            [fact({ round: 3 }), fact({ round: 12 }), fact({ round: 7 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.meetings.map((m) => m.round)).toEqual([12, 7, 3]);
    });

    it('carries the season goal differential from A perspective', () => {
        const h2h = buildHeadToHead(
            [fact({ homeScore: 50, awayScore: 40 })],
            'a',
            'b',
            'all',
        );
        expect(h2h.bySeason[0].goalDiff).toBe(10);
    });

    it('excludes byes, which have only one side', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'bye', awayClubKey: null, awayScore: null })],
            'a',
            'b',
            'all',
        );
        expect(h2h.record.played).toBe(0);
        expect(h2h.meetings).toEqual([]);
    });

    it('omits goals for a game with no recorded score', () => {
        const h2h = buildHeadToHead(
            [fact({ status: 'forfeit', homeScore: null, awayScore: null })],
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
        expect(h2h.meetings[0].isFinals).toBe(true);
        expect(h2h.meetings[0].roundName).toBe('Grand Final');
    });
});

describe('topOpponents', () => {
    it('orders by games played then name, so ties are stable', () => {
        expect(
            topOpponents([
                { clubKey: 'b', name: 'Bravo', played: 3 },
                { clubKey: 'c', name: 'Charlie', played: 9 },
                { clubKey: 'a', name: 'Alpha', played: 3 },
            ]),
        ).toEqual([
            { clubKey: 'c', name: 'Charlie', played: 9 },
            { clubKey: 'a', name: 'Alpha', played: 3 },
            { clubKey: 'b', name: 'Bravo', played: 3 },
        ]);
    });

    it('is empty for a club with no games', () => {
        expect(topOpponents([])).toEqual([]);
    });
});
