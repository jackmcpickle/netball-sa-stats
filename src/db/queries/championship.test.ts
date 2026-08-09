import { describe, expect, it } from 'vitest';
import type { ChampionshipRow } from '@/data/types';
import { sortChampionshipRows } from '@/db/queries/championship';

describe('sortChampionshipRows', () => {
    it('breaks ties on rank so paging is stable', () => {
        const rows = [
            { rank: 3, points: 10, teams: 5, club: { name: 'C', key: 'c' } },
            { rank: 1, points: 10, teams: 5, club: { name: 'A', key: 'a' } },
            { rank: 2, points: 10, teams: 5, club: { name: 'B', key: 'b' } },
        ] as ChampionshipRow[];
        const sorted = sortChampionshipRows(rows, {
            sort: 'points',
            desc: true,
            page: 1,
            pageSize: 50,
        });
        expect(sorted.map((row) => row.rank)).toEqual([1, 2, 3]);
    });

    it('sorts by club name ascending', () => {
        const rows = [
            { rank: 1, points: 10, teams: 5, club: { name: 'Zed', key: 'z' } },
            { rank: 2, points: 9, teams: 4, club: { name: 'Ace', key: 'a' } },
        ] as ChampionshipRow[];
        const sorted = sortChampionshipRows(rows, {
            sort: 'club',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(sorted[0].club.name).toBe('Ace');
    });
});
