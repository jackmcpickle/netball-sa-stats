/**
 * Fetches clubs and hands them (or one club's results) to the domain layer.
 * `fetchClubs`/`accentFor` used to live in `src/db/queries/clubs.ts`; that
 * fetch logic now lives here.
 */
import { asc } from 'drizzle-orm';
import type { Db } from '@/db';
import { fetchClubProfile } from '@/db/queries/club-profile';
import { clubs } from '@/db/schema';
import type { ClubProfile } from '@/server/dto/club-profile.dto';
import type { Club } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/club-accent';

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
    profile(clubKey: string): Promise<ClubProfile | null>;
} {
    return {
        async all(): Promise<readonly Club[]> {
            return fetchClubs(db);
        },
        async profile(clubKey: string): Promise<ClubProfile | null> {
            return fetchClubProfile(db, clubKey);
        },
    };
}
