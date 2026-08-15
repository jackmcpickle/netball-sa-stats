/**
 * Fetches clubs and hands them (or one club's results) to the domain layer.
 * `fetchClubs`/`accentFor` used to live in `src/db/queries/clubs.ts`; that
 * fetch logic now lives here.
 */
import { asc, desc, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Db } from '@/db';
import { fetchClubProfile } from '@/db/queries/club-profile';
import { countResults, fetchResults } from '@/db/queries/results';
import type { ResultPage } from '@/db/queries/results';
import { clubs, grades, seasons, teamSeasonResults } from '@/db/schema';
import { toGradeResults } from '@/server/domain/club-history';
import type { PageRequest } from '@/server/domain/table-query';
import type {
    ClubGradeResult,
    ClubProfile,
} from '@/server/dto/club-profile.dto';
import type { Club } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/club-accent';

/**
 * Only ids the results table gives a clickable header — see
 * `CLUB_RESULTS_TABLE_SPEC`. `coalesce(won, 0)` keeps archive rows, which
 * carry no W-L-D at all, sorting as zero rather than clustering at one end.
 */
const CLUB_RESULT_ORDER: Record<string, SQL | SQLiteColumn> = {
    year: seasons.startYear,
    grade: grades.name,
    position: teamSeasonResults.ladderPosition,
    won: sql`coalesce(${teamSeasonResults.won}, 0)`,
};

/**
 * Every sort ties back to (year desc, grade key asc). Without that, seasons
 * level on the sorted column can swap between requests and the same grade
 * finish appears on two pages — or on none.
 */
function clubResultPageFor(request: PageRequest): ResultPage {
    const column = CLUB_RESULT_ORDER[request.sort] ?? CLUB_RESULT_ORDER.year;
    return {
        order: [
            request.desc ? desc(column) : asc(column),
            desc(seasons.startYear),
            asc(grades.gradeKey),
        ],
        limit: request.limit,
        offset: request.offset,
    };
}

export type ClubRow = {
    readonly id: number;
    readonly clubKey: string;
    readonly name: string;
    readonly establishedYear: number | null;
    readonly homeVenue: string | null;
};

export function toClub(row: ClubRow): Club {
    return {
        key: row.clubKey,
        name: row.name,
        establishedYear: row.establishedYear,
        homeVenue: row.homeVenue,
        accent: accentFor(row.clubKey),
    };
}

export async function fetchClubs(db: Db): Promise<readonly Club[]> {
    const rows = await db
        .select({
            id: clubs.id,
            clubKey: clubs.clubKey,
            name: clubs.name,
            establishedYear: clubs.establishedYear,
            homeVenue: clubs.homeVenue,
        })
        .from(clubs)
        .orderBy(asc(clubs.name));
    return rows.map(toClub);
}

export function createClubsRepo(db: Db): {
    all(): Promise<readonly Club[]>;
    profile(clubKey: string): Promise<ClubProfile | null>;
    countResults(clubKey: string): Promise<number>;
    resultsPage(
        clubKey: string,
        request: PageRequest,
    ): Promise<readonly ClubGradeResult[]>;
} {
    return {
        async all(): Promise<readonly Club[]> {
            return await fetchClubs(db);
        },
        async profile(clubKey: string): Promise<ClubProfile | null> {
            return await fetchClubProfile(db, clubKey);
        },
        async countResults(clubKey: string): Promise<number> {
            return await countResults(db, { clubKey });
        },
        async resultsPage(
            clubKey: string,
            request: PageRequest,
        ): Promise<readonly ClubGradeResult[]> {
            return toGradeResults(
                await fetchResults(db, { clubKey }, clubResultPageFor(request)),
            );
        },
    };
}
