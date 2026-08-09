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

describe('Ladder.teamCount', () => {
    it('reports the pre-slice total, not the size of a paged-down page', () => {
        const rows = Array.from({ length: 5 }, (_, index) =>
            row(index + 1, 10, `Team ${String(index)}`),
        );
        const ladder = Ladder.from(grade, rows);
        const paged = ladder.sorted(
            TableQuery.from({ pageSize: 25, page: 1 }, spec),
        );
        expect(ladder.teamCount()).toBe(5);
        expect(paged.totalRows).toBe(5);
    });
});
