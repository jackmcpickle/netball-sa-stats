import { describe, expect, it } from 'vitest';
import type { LadderRow } from '@/data/types';
import { sortLadderRows } from '@/db/queries/grades';

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

describe('sortLadderRows', () => {
    it('breaks ties on ladder position so paging is stable', () => {
        const rows = [row(3, 10, 'C'), row(1, 10, 'A'), row(2, 10, 'B')];
        const sorted = sortLadderRows(rows, {
            sort: 'points',
            desc: true,
            page: 1,
            pageSize: 50,
        });
        expect(sorted.map((entry) => entry.position)).toEqual([1, 2, 3]);
    });

    it('sorts by team name ascending', () => {
        const rows = [row(1, 10, 'Zed'), row(2, 9, 'Ace')];
        const sorted = sortLadderRows(rows, {
            sort: 'team',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(sorted[0].displayName).toBe('Ace');
    });

    it('defaults to position ascending', () => {
        const rows = [row(2, 9, 'B'), row(1, 10, 'A')];
        const sorted = sortLadderRows(rows, {
            sort: 'position',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(sorted.map((entry) => entry.position)).toEqual([1, 2]);
    });
});
