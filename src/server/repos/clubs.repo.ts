/**
 * Fetches clubs and hands them (or one club's results) to the domain layer.
 * `fetchClubs`/`accentFor` used to live in `src/db/queries/clubs.ts`; that
 * fetch logic now lives here.
 */
import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { fetchClubProfile } from '@/db/queries/club-profile';
import { fetchResults } from '@/db/queries/results';
import { clubs } from '@/db/schema';
import { ClubHistory } from '@/server/domain/club-history';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import type { ClubProfile } from '@/server/dto/club-profile.dto';
import type { Club } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/club-accent';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';

export { accentFor } from '@/server/repos/club-accent';

export interface ClubRow {
    readonly id: number;
    readonly clubKey: string;
    readonly name: string;
    readonly establishedYear: number | null;
    readonly homeVenue: string | null;
}

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
    historyOf(clubKey: string): Promise<Result<ClubHistory, DomainError>>;
    profile(clubKey: string): Promise<ClubProfile | null>;
} {
    return {
        async all(): Promise<readonly Club[]> {
            return fetchClubs(db);
        },
        async profile(clubKey: string): Promise<ClubProfile | null> {
            return fetchClubProfile(db, clubKey);
        },
        async historyOf(
            clubKey: string,
        ): Promise<Result<ClubHistory, DomainError>> {
            const rows = await fetchResults(db, { clubKey });
            const first = rows[0];
            if (!first) {
                return err({ kind: 'not-found', entity: 'club', key: clubKey });
            }
            const club: Club = {
                key: first.clubKey,
                name: first.clubName,
                establishedYear: first.establishedYear,
                homeVenue: first.homeVenue,
                accent: accentFor(first.clubKey),
            };
            const coverage = await createSeasonsRepo(db).coverage();
            return ok(ClubHistory.from(club, rows, coverage.rankedYears()));
        },
    };
}
