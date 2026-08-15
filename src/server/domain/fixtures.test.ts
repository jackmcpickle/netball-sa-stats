import { describe, expect, it } from 'vitest';
import { marginFor, toResultRows } from '@/server/domain/fixtures';
import type { GameFact } from '@/server/dto/head-to-head.dto';

function fact(overrides: Partial<GameFact>): GameFact {
    return {
        awayClubKey: 'b',
        awayScore: 32,
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

describe(marginFor, () => {
    it('is the absolute score difference for a played game', () => {
        expect(
            marginFor({ awayScore: 32, homeScore: 50, status: 'final' }),
        ).toBe(18);
    });

    it('is zero for a draw', () => {
        expect(
            marginFor({ awayScore: 40, homeScore: 40, status: 'final' }),
        ).toBe(0);
    });

    it('is null when a score is missing', () => {
        expect(
            marginFor({ awayScore: 30, homeScore: null, status: 'no_result' }),
        ).toBeNull();
    });

    it('is null for a bye, which has no opponent', () => {
        expect(
            marginFor({ awayScore: null, homeScore: null, status: 'bye' }),
        ).toBeNull();
    });

    it('is null for a forfeit, whose 0-20 scoreline is fabricated', () => {
        // A 20-goal "margin" nobody played would top any margin sort.
        expect(
            marginFor({ awayScore: 0, homeScore: 20, status: 'forfeit' }),
        ).toBeNull();
    });
});

describe(toResultRows, () => {
    it('carries the margin and both club keys onto the row', () => {
        const [result] = toResultRows([fact({})]);
        expect(result.margin).toBe(18);
        expect(result.homeClubKey).toBe('a');
        expect(result.awayClubKey).toBe('b');
    });

    it('is comparable only when two different clubs are present', () => {
        // The head-to-head link needs two club keys, and a club cannot play
        // itself — an intra-club fixture would link to an empty page.
        const rows = toResultRows([
            fact({}),
            fact({ awayClubKey: null, awayTeamName: null, status: 'bye' }),
            fact({ awayClubKey: 'a', awayTeamName: 'A 2' }),
        ]);
        expect(rows.map((entry) => entry.canCompare)).toStrictEqual([
            true,
            false,
            false,
        ]);
    });

    it('keeps the finals label rather than the shifted round number', () => {
        const [result] = toResultRows([
            fact({ isFinals: true, round: 99, roundName: 'Grand Final' }),
        ]);
        expect(result.isFinals).toBeTruthy();
        expect(result.roundName).toBe('Grand Final');
    });
});
