import { describe, expect, it } from 'vitest';
import type { ClubGradeResult } from '@/data/types';
import { sortClubResults } from '@/db/queries/club-profile';

function result(
    year: number,
    gradeKey: string,
    ladderPosition: number,
): ClubGradeResult {
    return {
        year,
        gradeKey,
        gradeName: gradeKey,
        competitionName: 'Comp',
        ladderPosition,
        teamCount: 8,
        won: 5,
        lost: 5,
        drawn: 0,
        percentage: 100,
        notes: null,
    };
}

describe('sortClubResults', () => {
    it('breaks ties on (year desc, gradeKey asc) so paging is stable', () => {
        const results = [
            result(2020, 'c', 1),
            result(2020, 'a', 1),
            result(2021, 'a', 1),
            result(2020, 'b', 1),
        ];
        const sorted = sortClubResults(results, {
            sort: 'position',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(
            sorted.map((entry) => `${String(entry.year)}-${entry.gradeKey}`),
        ).toEqual(['2021-a', '2020-a', '2020-b', '2020-c']);
    });

    it('defaults to year descending', () => {
        const results = [result(2018, 'a', 1), result(2022, 'a', 1)];
        const sorted = sortClubResults(results, {
            sort: 'year',
            desc: true,
            page: 1,
            pageSize: 50,
        });
        expect(sorted.map((entry) => entry.year)).toEqual([2022, 2018]);
    });

    it('sorts by grade name ascending', () => {
        const results = [result(2020, 'zed', 1), result(2020, 'ace', 1)];
        const sorted = sortClubResults(results, {
            sort: 'grade',
            desc: false,
            page: 1,
            pageSize: 50,
        });
        expect(sorted[0].gradeKey).toBe('ace');
    });
});
