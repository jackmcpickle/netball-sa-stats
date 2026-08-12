import { describe, expect, it } from 'vitest';
import { Ladder } from '@/server/domain/ladder';
import { TableQuery } from '@/server/domain/table-query';
import type { LadderRow } from '@/server/dto/ladders.dto';
import type { GradeSummary } from '@/server/dto/shared.dto';

const spec = {
    sortable: [
        'position',
        'team',
        'played',
        'won',
        'lost',
        'drawn',
        'goalsFor',
        'goalsAgainst',
        'percentage',
        'points',
    ],
    defaultSort: 'position',
    defaultDesc: false,
} as const;

const grade = {
    key: 'g',
    name: 'A1',
    year: 2024,
    competition: { key: 'amnd', name: 'AMND' },
    teamCount: 3,
} as GradeSummary;

function row(position: number, points: number, name: string): LadderRow {
    return {
        position,
        club: {
            key: name.toLowerCase(),
            name,
            establishedYear: null,
            homeVenue: null,
            accent: 'pink',
        },
        displayName: name,
        played: 10,
        won: 5,
        lost: 5,
        drawn: 0,
        goalsFor: 100,
        goalsAgainst: 100,
        percentage: 100,
        points,
        notes: null,
    };
}

describe('Ladder.sorted', () => {
    it('breaks ties on ladder position so paging is stable', () => {
        const rows = [row(3, 10, 'C'), row(1, 10, 'A'), row(2, 10, 'B')];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'points', dir: 'desc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.position)).toEqual([1, 2, 3]);
    });

    it('sorts by team name ascending', () => {
        const rows = [row(1, 10, 'Zed'), row(2, 9, 'Ace')];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'team', dir: 'asc' }, spec),
        );
        expect(sorted.rows[0]?.displayName).toBe('Ace');
    });

    it('defaults to position ascending', () => {
        const rows = [row(2, 9, 'B'), row(1, 10, 'A')];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'position', dir: 'asc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.position)).toEqual([1, 2]);
    });
});

function rowWith(
    position: number,
    name: string,
    overrides: Partial<LadderRow>,
): LadderRow {
    return { ...row(position, 10, name), ...overrides };
}

/**
 * These columns are reachable straight from URL search params (`?sort=`),
 * so their comparators need direct coverage even though nothing in the app
 * currently links to them by these names.
 */
describe('Ladder.sorted attacker-reachable columns', () => {
    it('sorts by played ascending', () => {
        const rows = [
            rowWith(1, 'A', { played: 20 }),
            rowWith(2, 'B', { played: 5 }),
        ];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'played', dir: 'asc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.displayName)).toEqual([
            'B',
            'A',
        ]);
    });

    it('sorts by won descending', () => {
        const rows = [rowWith(1, 'A', { won: 2 }), rowWith(2, 'B', { won: 9 })];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'won', dir: 'desc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.displayName)).toEqual([
            'B',
            'A',
        ]);
    });

    it('sorts by lost ascending', () => {
        const rows = [
            rowWith(1, 'A', { lost: 8 }),
            rowWith(2, 'B', { lost: 1 }),
        ];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'lost', dir: 'asc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.displayName)).toEqual([
            'B',
            'A',
        ]);
    });

    it('sorts by drawn descending', () => {
        const rows = [
            rowWith(1, 'A', { drawn: 0 }),
            rowWith(2, 'B', { drawn: 4 }),
        ];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'drawn', dir: 'desc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.displayName)).toEqual([
            'B',
            'A',
        ]);
    });

    it('sorts by goalsFor descending', () => {
        const rows = [
            rowWith(1, 'A', { goalsFor: 40 }),
            rowWith(2, 'B', { goalsFor: 120 }),
        ];
        const sorted = Ladder.from(grade, rows).sorted(
            TableQuery.from({ sort: 'goalsFor', dir: 'desc' }, spec),
        );
        expect(sorted.rows.map((entry) => entry.displayName)).toEqual([
            'B',
            'A',
        ]);
    });
});

describe('Ladder.sorted totalRows', () => {
    it('reports the pre-slice total, not the size of a paged-down page', () => {
        const rows = Array.from({ length: 5 }, (_, index) =>
            row(index + 1, 10, `Team ${String(index)}`),
        );
        const ladder = Ladder.from(grade, rows);
        const paged = ladder.sorted(
            TableQuery.from({ pageSize: 25, page: 1 }, spec),
        );
        expect(paged.totalRows).toBe(5);
    });
});
