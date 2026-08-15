/**
 * Fetches grades for a year, and one grade's ladder handed to the `Ladder`
 * domain object. `fetchGrades`/`fetchLadder` used to live in
 * `src/db/queries/grades.ts`; that fetch logic now lives here.
 */
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Db } from '@/db';
import { toCompetition } from '@/db/queries/coverage';
import { countResults, fetchResults } from '@/db/queries/results';
import type { ResultPage, ResultRow } from '@/db/queries/results';
import {
    competitions,
    grades,
    seasons,
    teams,
    teamSeasonResults,
} from '@/db/schema';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import type { PageRequest } from '@/server/domain/table-query';
import type { LadderRow } from '@/server/dto/ladders.dto';
import type { GradeSummary } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/club-accent';

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
            competitionKey: competitions.key,
            competitionName: competitions.name,
            key: grades.gradeKey,
            name: grades.name,
            teamCount: grades.teamCount,
            year: seasons.startYear,
        })
        .from(grades)
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .where(eq(seasons.startYear, year))
        .orderBy(asc(grades.tier), asc(grades.division), asc(grades.name));

    return rows.map((row) => ({
        competition: toCompetition(row.competitionKey, row.competitionName),
        key: row.key,
        name: row.name,
        teamCount: row.teamCount,
        year: row.year,
    }));
}

/**
 * Ladder sort ids to columns. `coalesce(..., 0)` preserves the behaviour of
 * the JS comparators this replaced: archive rows carry NULL played/won/goals
 * and were compared as zero, so they keep sorting as zero rather than
 * clustering at one end the way raw SQL NULLs would.
 */
const LADDER_ORDER = new Map<string, SQL | SQLiteColumn>([
    ['position', teamSeasonResults.ladderPosition],
    ['team', teams.displayName],
    ['played', sql`coalesce(${teamSeasonResults.played}, 0)`],
    ['won', sql`coalesce(${teamSeasonResults.won}, 0)`],
    ['lost', sql`coalesce(${teamSeasonResults.lost}, 0)`],
    ['drawn', sql`coalesce(${teamSeasonResults.drawn}, 0)`],
    ['goalsFor', sql`coalesce(${teamSeasonResults.goalsFor}, 0)`],
    ['goalsAgainst', sql`coalesce(${teamSeasonResults.goalsAgainst}, 0)`],
    ['percentage', sql`coalesce(${teamSeasonResults.percentage}, 0)`],
    ['points', sql`coalesce(${teamSeasonResults.points}, 0)`],
]);

/**
 * Ladder position is the tiebreaker on every sort. Without one, teams level
 * on the sorted column can swap between requests and the same team appears
 * on two pages — or on none.
 */
function ladderPageFor(request: PageRequest): ResultPage {
    const column =
        LADDER_ORDER.get(request.sort) ?? teamSeasonResults.ladderPosition;
    return {
        limit: request.limit,
        offset: request.offset,
        order: [
            request.desc ? desc(column) : asc(column),
            asc(teamSeasonResults.ladderPosition),
        ],
    };
}

function toLadderRow(row: ResultRow): LadderRow {
    return {
        club: {
            accent: accentFor(row.clubKey),
            establishedYear: row.establishedYear,
            homeVenue: row.homeVenue,
            key: row.clubKey,
            name: row.clubName,
        },
        displayName: row.displayName,
        drawn: row.drawn,
        goalsAgainst: row.goalsAgainst,
        goalsFor: row.goalsFor,
        lost: row.lost,
        notes: row.notes,
        percentage: row.percentage,
        played: row.played,
        points: row.points,
        position: row.ladderPosition,
        won: row.won,
    };
}

export interface LadderPage {
    readonly grade: GradeSummary;
    readonly rows: readonly LadderRow[];
}

export interface GradesRepo {
    readonly forYear: (year: number) => Promise<readonly GradeSummary[]>;
    readonly countLadder: (gradeKey: string) => Promise<number>;
    readonly ladderPage: (
        gradeKey: string,
        request: PageRequest,
    ) => Promise<Result<LadderPage, DomainError>>;
}

export function createGradesRepo(db: Db): GradesRepo {
    return {
        async countLadder(gradeKey: string): Promise<number> {
            return await countResults(db, { gradeKey });
        },
        async forYear(year: number): Promise<readonly GradeSummary[]> {
            return await fetchGrades(db, year);
        },
        async ladderPage(
            gradeKey: string,
            request: PageRequest,
        ): Promise<Result<LadderPage, DomainError>> {
            const rows = await fetchResults(
                db,
                { gradeKey },
                ladderPageFor(request),
            );
            const [first] = rows;
            if (!first) {
                return err({
                    entity: 'grade',
                    key: gradeKey,
                    kind: 'not-found',
                });
            }

            return ok({
                grade: {
                    competition: toCompetition(
                        first.competitionKey,
                        first.competitionName,
                    ),
                    key: first.gradeKey,
                    name: first.gradeName,
                    teamCount: first.teamCount,
                    year: first.year,
                },
                rows: rows.map(toLadderRow),
            });
        },
    };
}
