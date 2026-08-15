import { describe, expect, it } from 'vitest';
import {
    previousRanks,
    rankClubs,
    rankSeasons,
    teamPoints,
    winRate,
} from '@/pipeline/scoring/championship';
import type { ScoringRow } from '@/pipeline/scoring/championship';

function row(overrides: Partial<ScoringRow> = {}): ScoringRow {
    return {
        clubKey: 'contax',
        drawn: 0,
        ladderPosition: 1,
        lost: 0,
        positionUncertain: false,
        teamCount: 10,
        weight: 1,
        won: 9,
        year: 2025,
        ...overrides,
    };
}

describe(teamPoints, () => {
    it('rewards a deeper grade at the same finish', () => {
        const wide = teamPoints(row({ ladderPosition: 1, teamCount: 12 }));
        const narrow = teamPoints(row({ ladderPosition: 1, teamCount: 6 }));
        expect(wide).toBeGreaterThan(narrow);
        expect(wide).toBe(12);
        expect(narrow).toBe(6);
    });

    it('still credits last place with one unit of the grade weight', () => {
        expect(teamPoints(row({ ladderPosition: 8, teamCount: 8 }))).toBe(1);
    });

    it('applies the grade weight', () => {
        expect(
            teamPoints(row({ ladderPosition: 1, teamCount: 10, weight: 0.36 })),
        ).toBeCloseTo(3.6, 10);
    });

    it('never returns negative points for an out-of-range position', () => {
        expect(teamPoints(row({ ladderPosition: 9, teamCount: 6 }))).toBe(0);
    });
});

describe(rankClubs, () => {
    it('ranks on weighted points, best first', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', ladderPosition: 1, teamCount: 10, weight: 1 }),
            row({
                clubKey: 'b',
                ladderPosition: 5,
                teamCount: 10,
                weight: 0.5,
            }),
        ]);
        expect(totals.map((entry) => entry.clubKey)).toStrictEqual(['a', 'b']);
        expect(totals[0].points).toBe(10);
        expect(totals[1].points).toBe(3);
    });

    it('lets depth beat a single strong team', () => {
        const deep = Array.from({ length: 6 }, () =>
            row({
                clubKey: 'deep',
                drawn: null,
                ladderPosition: 5,
                lost: null,
                teamCount: 10,
                weight: 0.5,
                won: null,
                // Six mid-table sides in weak grades, all in the one season.
                year: 2025,
            }),
        );
        const totals = rankClubs([
            ...deep,
            row({
                clubKey: 'narrow',
                ladderPosition: 1,
                teamCount: 10,
                weight: 1,
            }),
        ]);
        expect(totals[0].clubKey).toBe('deep');
        expect(totals[0].teams).toBe(6);
        expect(totals[0].points).toBe(18);
    });

    it('counts both of a club two teams in one grade', () => {
        const totals = rankClubs([
            row({ clubKey: 'walkerville', ladderPosition: 2, teamCount: 8 }),
            row({ clubKey: 'walkerville', ladderPosition: 7, teamCount: 8 }),
        ]);
        expect(totals[0].teams).toBe(2);
        expect(totals[0].points).toBe(9);
    });

    it('does not turn absent win counts into a zero win rate', () => {
        const totals = rankClubs([
            row({ clubKey: 'unknown', drawn: null, lost: null, won: null }),
        ]);
        expect(totals[0].winPercentage).toBeNull();
        expect(totals[0].gamesPlayed).toBe(0);
    });

    it('averages win rate only over rows that reported one', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', drawn: 0, lost: 2, won: 6 }),
            row({ clubKey: 'a', drawn: null, lost: null, won: null }),
        ]);
        expect(totals[0].winPercentage).toBe(75);
        expect(totals[0].gamesPlayed).toBe(8);
    });

    it('counts ladder wins but not uncertain archive placings', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', ladderPosition: 1 }),
            row({ clubKey: 'a', ladderPosition: 1, positionUncertain: true }),
        ]);
        expect(totals[0].minorPremierships).toBe(1);
        expect(totals[0].teams).toBe(2);
    });

    it('shares a rank between clubs level on points', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', ladderPosition: 1, teamCount: 10 }),
            row({ clubKey: 'b', ladderPosition: 1, teamCount: 10 }),
            row({ clubKey: 'c', ladderPosition: 4, teamCount: 10 }),
        ]);
        expect(totals.map((entry) => entry.rank)).toStrictEqual([1, 1, 3]);
    });
});

describe(rankSeasons, () => {
    const rows: readonly ScoringRow[] = [
        row({ clubKey: 'a', ladderPosition: 1, year: 2024 }),
        row({ clubKey: 'b', ladderPosition: 6, year: 2024 }),
        row({ clubKey: 'b', ladderPosition: 1, year: 2025 }),
        row({ clubKey: 'c', ladderPosition: 4, year: 2025 }),
    ];

    it('groups by year, oldest first', () => {
        expect(rankSeasons(rows).map((season) => season.year)).toStrictEqual([
            2024, 2025,
        ]);
    });

    it('excludes a season the caller filtered out', () => {
        const final = rows.filter((entry) => entry.year !== 2025);
        expect(rankSeasons(final)).toHaveLength(1);
        expect(rankSeasons(final)[0].year).toBe(2024);
    });

    it('has no previous rank for a club new to the championship', () => {
        const seasons = rankSeasons(rows);
        const previous = previousRanks(seasons[0]);
        expect(previous.get('b')).toBe(2);
        expect(previous.get('c')).toBeUndefined();
    });

    it('has no previous rank at all in the first covered season', () => {
        expect(previousRanks(undefined).size).toBe(0);
    });
});

describe(winRate, () => {
    it('is null without a record, even when games is zero', () => {
        expect(winRate(0, 0, false)).toBeNull();
        expect(winRate(0, 0, true)).toBeNull();
    });

    it('rounds to one decimal', () => {
        expect(winRate(1, 3, true)).toBe(33.3);
    });
});
