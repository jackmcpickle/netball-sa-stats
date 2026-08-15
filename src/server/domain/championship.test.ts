import { describe, expect, it } from 'vitest';
import { Championship } from '@/server/domain/championship';
import { TableQuery } from '@/server/domain/table-query';
import type {
    ChampionshipRow,
    ChampionshipSeason,
} from '@/server/dto/rankings.dto';

const spec = {
    sortable: ['rank', 'club', 'points', 'teams'],
    defaultSort: 'rank',
    defaultDesc: false,
} as const;

function historyOf(
    year: number,
    rows: readonly ChampionshipRow[],
): readonly ChampionshipSeason[] {
    return [{ year, rows, coverageChanged: false }];
}

describe('Championship.sorted', () => {
    it('breaks ties on rank so paging is stable', () => {
        // SAFETY: sorting reads only `rank`, `points`, `teams` and
        // `club.name`, all of which these literals supply; the omitted
        // display-only fields are never touched by the comparator.
        const rows = [
            { rank: 3, points: 10, teams: 5, club: { name: 'C', key: 'c' } },
            { rank: 1, points: 10, teams: 5, club: { name: 'A', key: 'a' } },
            { rank: 2, points: 10, teams: 5, club: { name: 'B', key: 'b' } },
        ] as ChampionshipRow[];
        const result = Championship.fromHistory(historyOf(2024, rows), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const sorted = result.value.sorted(
            TableQuery.from({ sort: 'points', dir: 'desc' }, spec),
        );
        expect(sorted.rows.map((row) => row.rank)).toStrictEqual([1, 2, 3]);
    });

    it('sorts by club name ascending', () => {
        // SAFETY: sorting reads only `rank`, `points`, `teams` and
        // `club.name`, all of which these literals supply; the omitted
        // display-only fields are never touched by the comparator.
        const rows = [
            { rank: 1, points: 10, teams: 5, club: { name: 'Zed', key: 'z' } },
            { rank: 2, points: 9, teams: 4, club: { name: 'Ace', key: 'a' } },
        ] as ChampionshipRow[];
        const result = Championship.fromHistory(historyOf(2024, rows), 2024);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const sorted = result.value.sorted(
            TableQuery.from({ sort: 'club', dir: 'asc' }, spec),
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
            ok: false,
            error: { kind: 'not-found', entity: 'season', key: '1999' },
        });
    });
});
