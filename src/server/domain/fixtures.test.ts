import { describe, expect, it } from 'vitest';
import {
    FIXTURES_TABLE_SPEC,
    marginFor,
    sortFixtures,
    toResultRows,
} from '@/server/domain/fixtures';
import { TableQuery } from '@/server/domain/table-query';
import type { GameFact } from '@/server/dto/head-to-head.dto';
import type { ResultRow } from '@/server/dto/results.dto';

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
        awayScore: 32,
        status: 'final',
        ...overrides,
    };
}

function row(overrides: Partial<ResultRow>): ResultRow {
    return {
        round: 1,
        roundName: 'Round 1',
        isFinals: false,
        playedAt: null,
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeClubKey: 'a',
        awayClubKey: 'b',
        homeScore: 50,
        awayScore: 32,
        margin: 18,
        status: 'final',
        canCompare: true,
        ...overrides,
    };
}

function query(sort: string, dir: 'asc' | 'desc'): TableQuery {
    return TableQuery.from({ sort, dir }, FIXTURES_TABLE_SPEC);
}

describe('marginFor', () => {
    it('is the absolute score difference for a played game', () => {
        expect(
            marginFor({ homeScore: 50, awayScore: 32, status: 'final' }),
        ).toBe(18);
    });

    it('is zero for a draw', () => {
        expect(
            marginFor({ homeScore: 40, awayScore: 40, status: 'final' }),
        ).toBe(0);
    });

    it('is null when a score is missing', () => {
        expect(
            marginFor({ homeScore: null, awayScore: 30, status: 'no_result' }),
        ).toBeNull();
    });

    it('is null for a bye, which has no opponent', () => {
        expect(
            marginFor({ homeScore: null, awayScore: null, status: 'bye' }),
        ).toBeNull();
    });

    it('is null for a forfeit, whose 0-20 scoreline is fabricated', () => {
        // A 20-goal "margin" nobody played would top any margin sort.
        expect(
            marginFor({ homeScore: 20, awayScore: 0, status: 'forfeit' }),
        ).toBeNull();
    });
});

describe('toResultRows', () => {
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
            fact({ status: 'bye', awayClubKey: null, awayTeamName: null }),
            fact({ awayClubKey: 'a', awayTeamName: 'A 2' }),
        ]);
        expect(rows.map((entry) => entry.canCompare)).toEqual([
            true,
            false,
            false,
        ]);
    });

    it('keeps the finals label rather than the shifted round number', () => {
        const [result] = toResultRows([
            fact({ isFinals: true, round: 99, roundName: 'Grand Final' }),
        ]);
        expect(result.isFinals).toBe(true);
        expect(result.roundName).toBe('Grand Final');
    });
});

describe('sortFixtures', () => {
    it('sorts by round ascending by default', () => {
        const sorted = sortFixtures(
            [row({ round: 9 }), row({ round: 2 })],
            query('round', 'asc'),
        );
        expect(sorted.map((entry) => entry.round)).toEqual([2, 9]);
    });

    it('is stable for rows level on the sorted column', () => {
        // Many games share a round number. Without a tiebreaker the same
        // fixture can appear on two pages, or on none.
        const rows = [
            row({ round: 1, homeTeamName: 'C' }),
            row({ round: 1, homeTeamName: 'A' }),
            row({ round: 1, homeTeamName: 'B' }),
        ];
        const forwards = sortFixtures(rows, query('round', 'asc'));
        const backwards = sortFixtures(
            [...rows].reverse(),
            query('round', 'asc'),
        );
        expect(forwards.map((entry) => entry.homeTeamName)).toEqual(
            backwards.map((entry) => entry.homeTeamName),
        );
    });

    it('puts an unplayed game last on a margin sort, in either direction', () => {
        const rows = [row({ margin: null, status: 'bye' }), row({ margin: 4 })];
        expect(
            sortFixtures(rows, query('margin', 'asc')).map(
                (entry) => entry.margin,
            ),
        ).toEqual([4, null]);
        expect(
            sortFixtures(rows, query('margin', 'desc')).map(
                (entry) => entry.margin,
            ),
        ).toEqual([4, null]);
    });

    it('falls back to the default column for an unknown sort', () => {
        const sorted = sortFixtures(
            [row({ round: 9 }), row({ round: 2 })],
            query('nonesuch', 'asc'),
        );
        expect(sorted.map((entry) => entry.round)).toEqual([2, 9]);
    });
});
