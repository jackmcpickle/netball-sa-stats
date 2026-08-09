/**
 * Fetches grades for a year, and one grade's ladder handed to the `Ladder`
 * domain object. `fetchGrades`/`fetchLadder` used to live in
 * `src/db/queries/grades.ts`; that fetch logic now lives here.
 */
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { toCompetition } from '@/db/queries/coverage';
import { fetchResults } from '@/db/queries/results';
import { competitions, grades, seasons } from '@/db/schema';
import { Ladder } from '@/server/domain/ladder';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import type { LadderRow } from '@/server/dto/ladders.dto';
import type { GradeSummary } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/clubs.repo';

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

export function createGradesRepo(db: Db): {
    forYear(year: number): Promise<readonly GradeSummary[]>;
    ladder(gradeKey: string): Promise<Result<Ladder, DomainError>>;
} {
    return {
        async forYear(year: number): Promise<readonly GradeSummary[]> {
            return fetchGrades(db, year);
        },
        async ladder(gradeKey: string): Promise<Result<Ladder, DomainError>> {
            const rows = await fetchResults(db, { gradeKey });
            const first = rows[0];
            if (!first) {
                return err({
                    kind: 'not-found',
                    entity: 'grade',
                    key: gradeKey,
                });
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

            const grade: GradeSummary = {
                key: first.gradeKey,
                name: first.gradeName,
                year: first.year,
                competition: toCompetition(
                    first.competitionKey,
                    first.competitionName,
                ),
                teamCount: first.teamCount,
            };

            return ok(Ladder.from(grade, ladderRows));
        },
    };
}
