/**
 * The one join every view is built from: a team's ladder finish, the grade it
 * finished in, and that grade's championship weight resolved here, at query
 * time, from `grade_weights`. Nothing precomputes a score into a column, so
 * editing a weight row re-ranks every season with no re-import.
 */
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import {
    clubs,
    competitions,
    gradeWeights,
    grades,
    seasons,
    teams,
    teamSeasonResults,
} from '@/db/schema';
import type { ScoringRow } from '@/pipeline/scoring/championship';

export interface ResultRow {
    readonly clubKey: string;
    readonly clubName: string;
    readonly establishedYear: number | null;
    readonly homeVenue: string | null;
    readonly year: number;
    readonly isFinal: boolean;
    readonly source: string;
    readonly placementBasis: string;
    readonly gradeKey: string;
    readonly gradeName: string;
    readonly competitionKey: string;
    readonly competitionName: string;
    readonly teamCount: number;
    /** Grade band. 1 is Premier Division. Divisions collapse to one band. */
    readonly tier: number;
    readonly displayName: string;
    readonly ladderPosition: number;
    readonly positionUncertain: boolean;
    /** Null only if a grade has no weight row, which the seed must prevent. */
    readonly weight: number | null;
    readonly played: number | null;
    readonly won: number | null;
    readonly drawn: number | null;
    readonly lost: number | null;
    readonly goalsFor: number | null;
    readonly goalsAgainst: number | null;
    readonly percentage: number | null;
    readonly points: number | null;
    /** Provenance, e.g. PlayHQ's played count not reconciling with W+D+L. */
    readonly notes: string | null;
}

export interface ResultFilter {
    /** Championship views pass true; ladders show in-progress seasons too. */
    readonly finalOnly?: boolean;
    readonly year?: number;
    readonly gradeKey?: string;
    readonly clubKey?: string;
    readonly competitionKey?: string;
}

/**
 * SQLite's `IS` is null-safe equality, which the weight join needs: single-grade
 * bands carry a NULL division and `= NULL` would never match them.
 */
function weightJoin(): SQL {
    return sql`${gradeWeights.competitionId} = ${seasons.competitionId} and ${gradeWeights.tier} = ${grades.tier} and ${gradeWeights.division} is ${grades.division}`;
}

function filters(filter: ResultFilter): SQL | undefined {
    const parts: SQL[] = [];
    if (filter.finalOnly === true) {
        parts.push(sql`${seasons.isFinal} = 1`);
    }
    if (!isUndefined(filter.year)) {
        parts.push(eq(seasons.startYear, filter.year));
    }
    if (!isUndefined(filter.gradeKey)) {
        parts.push(eq(grades.gradeKey, filter.gradeKey));
    }
    if (!isUndefined(filter.clubKey)) {
        parts.push(eq(clubs.clubKey, filter.clubKey));
    }
    if (!isUndefined(filter.competitionKey)) {
        parts.push(eq(competitions.key, filter.competitionKey));
    }
    return parts.length > 0 ? and(...parts) : undefined;
}

/**
 * How a caller wants one page of this join ordered and sliced. `order` is
 * built by the repo that owns the table, from an allow-listed sort id — see
 * `LADDER_ORDER` / `CLUB_RESULT_ORDER`.
 */
export interface ResultPage {
    readonly order: readonly (SQL | SQLiteColumn)[];
    readonly limit: number;
    readonly offset: number;
}

/** Row count for the same filter, so a page can be clamped before fetching. */
export async function countResults(
    db: Db,
    filter: ResultFilter = {},
): Promise<number> {
    const [row] = await db
        .select({ total: count() })
        .from(teamSeasonResults)
        .innerJoin(grades, eq(grades.id, teamSeasonResults.gradeId))
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .innerJoin(teams, eq(teams.id, teamSeasonResults.teamId))
        .innerJoin(clubs, eq(clubs.id, teams.clubId))
        .where(filters(filter));
    return row?.total ?? 0;
}

/**
 * Without `page`, every matching row in the site's canonical order — which is
 * what the championship scoring needs, since a rank computed over one page
 * would be meaningless. With `page`, SQL orders and slices instead.
 */
export async function fetchResults(
    db: Db,
    filter: ResultFilter = {},
    page?: ResultPage,
): Promise<readonly ResultRow[]> {
    const query = db
        .select({
            clubKey: clubs.clubKey,
            clubName: clubs.name,
            competitionKey: competitions.key,
            competitionName: competitions.name,
            displayName: teams.displayName,
            drawn: teamSeasonResults.drawn,
            establishedYear: clubs.establishedYear,
            goalsAgainst: teamSeasonResults.goalsAgainst,
            goalsFor: teamSeasonResults.goalsFor,
            gradeKey: grades.gradeKey,
            gradeName: grades.name,
            homeVenue: clubs.homeVenue,
            isFinal: seasons.isFinal,
            ladderPosition: teamSeasonResults.ladderPosition,
            lost: teamSeasonResults.lost,
            notes: teamSeasonResults.notes,
            percentage: teamSeasonResults.percentage,
            placementBasis: teamSeasonResults.placementBasis,
            played: teamSeasonResults.played,
            points: teamSeasonResults.points,
            positionUncertain: teamSeasonResults.positionUncertain,
            source: seasons.source,
            teamCount: grades.teamCount,
            tier: grades.tier,
            weight: gradeWeights.weight,
            won: teamSeasonResults.won,
            year: seasons.startYear,
        })
        .from(teamSeasonResults)
        .innerJoin(grades, eq(grades.id, teamSeasonResults.gradeId))
        .innerJoin(seasons, eq(seasons.id, grades.seasonId))
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .innerJoin(teams, eq(teams.id, teamSeasonResults.teamId))
        .innerJoin(clubs, eq(clubs.id, teams.clubId))
        .leftJoin(gradeWeights, weightJoin())
        .where(filters(filter))
        .orderBy(
            ...(page?.order ?? [
                asc(seasons.startYear),
                asc(grades.tier),
                asc(grades.division),
                asc(teamSeasonResults.ladderPosition),
            ]),
        );

    return isUndefined(page)
        ? await query
        : await query.limit(page.limit).offset(page.offset);
}

/** Narrow a joined row down to what the scoring module is allowed to see. */
export function toScoringRow(row: ResultRow): ScoringRow {
    return {
        clubKey: row.clubKey,
        drawn: row.drawn,
        ladderPosition: row.ladderPosition,
        lost: row.lost,
        positionUncertain: row.positionUncertain,
        teamCount: row.teamCount,
        weight: row.weight ?? 0,
        won: row.won,
        year: row.year,
    };
}
