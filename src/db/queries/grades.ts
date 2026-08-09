import { asc, eq } from 'drizzle-orm';
import type { GradeSummary, Ladder, LadderRow } from '@/data/types';
import type { Db } from '@/db';
import { accentFor } from '@/db/queries/clubs';
import { toCompetition } from '@/db/queries/coverage';
import type { TableSpec, TableState } from '@/db/queries/pagination';
import { fetchResults } from '@/db/queries/results';
import { competitions, grades, seasons } from '@/db/schema';

export const LADDER_TABLE_SPEC: TableSpec = {
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

type LadderComparator = (a: LadderRow, b: LadderRow) => number;

function numeric(pick: (row: LadderRow) => number | null): LadderComparator {
    return (a, b) => (pick(a) ?? 0) - (pick(b) ?? 0);
}

const LADDER_COMPARATORS: Record<string, LadderComparator> = {
    team: (a, b) => a.displayName.localeCompare(b.displayName),
    played: numeric((row) => row.played),
    won: numeric((row) => row.won),
    lost: numeric((row) => row.lost),
    drawn: numeric((row) => row.drawn),
    goalsFor: numeric((row) => row.goalsFor),
    goalsAgainst: numeric((row) => row.goalsAgainst),
    percentage: numeric((row) => row.percentage),
    points: numeric((row) => row.points),
    position: (a, b) => a.position - b.position,
};

/**
 * Every sort gets ladder position as a tiebreaker. Without one, teams level on
 * the sorted column can swap between requests and the same team appears on
 * two pages — or on none.
 */
export function sortLadderRows(
    rows: readonly LadderRow[],
    state: TableState,
): readonly LadderRow[] {
    const direction = state.desc ? -1 : 1;
    const compare =
        LADDER_COMPARATORS[state.sort] ?? LADDER_COMPARATORS.position;
    return [...rows].sort((a, b) => {
        const primary = compare(a, b);
        return primary === 0 ? a.position - b.position : primary * direction;
    });
}

/**
 * Every grade run in one calendar year, strongest band first so a 40-entry
 * select reads as a competition ladder rather than an alphabetical jumble.
 */
export async function fetchGrades(
    db: Db,
    year: number,
): Promise<readonly GradeSummary[]> {
    const rows = await db
        .select({
            key: grades.gradeKey,
            name: grades.name,
            year: seasons.startYear,
            teamCount: grades.teamCount,
            competitionKey: competitions.key,
            competitionName: competitions.name,
        })
        .from(grades)
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .where(eq(seasons.startYear, year))
        .orderBy(asc(grades.tier), asc(grades.division), asc(grades.name));

    return rows.map((row) => ({
        key: row.key,
        name: row.name,
        year: row.year,
        competition: toCompetition(row.competitionKey, row.competitionName),
        teamCount: row.teamCount,
    }));
}

export async function fetchLadder(
    db: Db,
    gradeKey: string,
): Promise<Ladder | null> {
    const rows = await fetchResults(db, { gradeKey });
    const first = rows[0];
    if (!first) {
        return null;
    }

    const ladderRows: readonly LadderRow[] = rows.map(
        (row): LadderRow => ({
            position: row.ladderPosition,
            club: {
                key: row.clubKey,
                name: row.clubName,
                establishedYear: row.establishedYear,
                homeVenue: row.homeVenue,
                accent: accentFor(row.clubKey),
            },
            displayName: row.displayName,
            played: row.played,
            won: row.won,
            lost: row.lost,
            drawn: row.drawn,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            percentage: row.percentage,
            points: row.points,
            notes: row.notes,
        }),
    );

    return {
        grade: {
            key: first.gradeKey,
            name: first.gradeName,
            year: first.year,
            competition: toCompetition(
                first.competitionKey,
                first.competitionName,
            ),
            teamCount: first.teamCount,
        },
        rows: ladderRows,
    };
}
