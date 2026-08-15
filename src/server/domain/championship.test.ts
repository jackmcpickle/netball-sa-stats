import { describe, expect, it } from 'vitest';
import { Championship } from '@/server/domain/championship';
import { TableQuery } from '@/server/domain/table-query';
import type {
    ChampionshipRow,
    ChampionshipSeason,
} from '@/server/dto/rankings.dto';

const spec = {
    defaultDesc: false,
    defaultSort: 'rank',
    sortable: ['rank', 'club', 'points', 'teams'],
} as const;

function historyOf(
    year: number,
    rows: readonly ChampionshipRow[],
): readonly ChampionshipSeason[] {
    return [{ coverageChanged: false, rows, year }];
}

describe('Championship.sorted', () => {
    it('breaks ties on rank so paging is stable', () => {
        // SAFETY: sorting reads only `rank`, `points`, `teams` and
        // `club.name`, all of which these literals supply; the omitted
        // display-only fields are never touched by the comparator.
        const rows = [
            { club: { key: 'c', name: 'C' }, points: 10, rank: 3, teams: 5 },
            { club: { key: 'a', name: 'A' }, points: 10, rank: 1, teams: 5 },
            { club: { key: 'b', name: 'B' }, points: 10, rank: 2, teams: 5 },
        ] as ChampionshipRow[];
        const result = Championship.fromHistory(historyOf(2024, rows), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const sorted = result.value.sorted(
            TableQuery.from({ dir: 'desc', sort: 'points' }, spec),
        );
        expect(sorted.rows.map((row) => row.rank)).toStrictEqual([1, 2, 3]);
    });

    it('sorts by club name ascending', () => {
        // SAFETY: sorting reads only `rank`, `points`, `teams` and
        // `club.name`, all of which these literals supply; the omitted
        // display-only fields are never touched by the comparator.
        const rows = [
            { club: { key: 'z', name: 'Zed' }, points: 10, rank: 1, teams: 5 },
            { club: { key: 'a', name: 'Ace' }, points: 9, rank: 2, teams: 4 },
        ] as ChampionshipRow[];
        const result = Championship.fromHistory(historyOf(2024, rows), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const sorted = result.value.sorted(
            TableQuery.from({ dir: 'asc', sort: 'club' }, spec),
        );
        expect(sorted.rows[0]?.club.name).toBe('Ace');
    });
});

describe('Championship.previousYear', () => {
    it('is the ranked year immediately before this one', () => {
        const result = Championship.fromHistory(historyOf(2022, []), 2022);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.previousYear([2018, 2020, 2022])).toBe(2020);
    });

    it('is null for the earliest ranked year', () => {
        const result = Championship.fromHistory(historyOf(2018, []), 2018);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.previousYear([2018, 2020, 2022])).toBeNull();
    });

    it('is null when the year itself is not ranked', () => {
        const result = Championship.fromHistory(historyOf(2019, []), 2019);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.previousYear([2018, 2020, 2022])).toBeNull();
    });
});

describe('Championship.fromHistory', () => {
    it('reports not-found for a year with no season', () => {
        const result = Championship.fromHistory(historyOf(2024, []), 1999);
        expect(result).toStrictEqual({
            error: { entity: 'season', key: '1999', kind: 'not-found' },
            ok: false,
        });
    });
});
