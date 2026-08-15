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
        year: 2025,
        ladderPosition: 1,
        teamCount: 10,
        weight: 1,
        positionUncertain: false,
        won: 9,
        lost: 0,
        drawn: 0,
        ...overrides,
    };
}

describe(teamPoints, () => {
    it('rewards a deeper grade at the same finish', () => {
        const wide = teamPoints(row({ teamCount: 12, ladderPosition: 1 }));
        const narrow = teamPoints(row({ teamCount: 6, ladderPosition: 1 }));
        expect(wide).toBeGreaterThan(narrow);
        expect(wide).toBe(12);
        expect(narrow).toBe(6);
    });

    it('still credits last place with one unit of the grade weight', () => {
        expect(teamPoints(row({ teamCount: 8, ladderPosition: 8 }))).toBe(1);
    });

    it('applies the grade weight', () => {
        expect(
            teamPoints(row({ teamCount: 10, ladderPosition: 1, weight: 0.36 })),
        ).toBeCloseTo(3.6, 10);
    });

    it('never returns negative points for an out-of-range position', () => {
        expect(teamPoints(row({ teamCount: 6, ladderPosition: 9 }))).toBe(0);
    });
});

describe(rankClubs, () => {
    it('ranks on weighted points, best first', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', teamCount: 10, ladderPosition: 1, weight: 1 }),
            row({
                clubKey: 'b',
                teamCount: 10,
                ladderPosition: 5,
                weight: 0.5,
            }),
        ]);
        expect(totals.map((entry) => entry.clubKey)).toStrictEqual(['a', 'b']);
        expect(totals[0].points).toBe(10);
        expect(totals[1].points).toBe(3);
    });

    it('lets depth beat a single strong team', () => {
        const deep = Array.from({ length: 6 }, (_, i) =>
            row({
                clubKey: 'deep',
                teamCount: 10,
                ladderPosition: 5,
                weight: 0.5,
                won: null,
                lost: null,
                drawn: null,
                // Six mid-table sides in weak grades.
                year: 2025 + i * 0,
            }),
        );
        const totals = rankClubs([
            ...deep,
            row({
                clubKey: 'narrow',
                teamCount: 10,
                ladderPosition: 1,
                weight: 1,
            }),
        ]);
        expect(totals[0].clubKey).toBe('deep');
        expect(totals[0].teams).toBe(6);
        expect(totals[0].points).toBe(18);
    });

    it('counts both of a club two teams in one grade', () => {
        const totals = rankClubs([
            row({ clubKey: 'walkerville', teamCount: 8, ladderPosition: 2 }),
            row({ clubKey: 'walkerville', teamCount: 8, ladderPosition: 7 }),
        ]);
        expect(totals[0].teams).toBe(2);
        expect(totals[0].points).toBe(9);
    });

    it('does not turn absent win counts into a zero win rate', () => {
        const totals = rankClubs([
            row({ clubKey: 'unknown', won: null, lost: null, drawn: null }),
        ]);
        expect(totals[0].winPercentage).toBeNull();
        expect(totals[0].gamesPlayed).toBe(0);
    });

    it('averages win rate only over rows that reported one', () => {
        const totals = rankClubs([
            row({ clubKey: 'a', won: 6, lost: 2, drawn: 0 }),
            row({ clubKey: 'a', won: null, lost: null, drawn: null }),
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
            row({ clubKey: 'a', teamCount: 10, ladderPosition: 1 }),
            row({ clubKey: 'b', teamCount: 10, ladderPosition: 1 }),
            row({ clubKey: 'c', teamCount: 10, ladderPosition: 4 }),
        ]);
        expect(totals.map((entry) => entry.rank)).toStrictEqual([1, 1, 3]);
    });
});

describe(rankSeasons, () => {
    const rows: readonly ScoringRow[] = [
        row({ clubKey: 'a', year: 2024, ladderPosition: 1 }),
        row({ clubKey: 'b', year: 2024, ladderPosition: 6 }),
        row({ clubKey: 'b', year: 2025, ladderPosition: 1 }),
        row({ clubKey: 'c', year: 2025, ladderPosition: 4 }),
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
