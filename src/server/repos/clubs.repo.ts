/**
 * Fetches clubs and hands them (or one club's results) to the domain layer.
 * `fetchClubs`/`accentFor` used to live in `src/db/queries/clubs.ts`; that
 * fetch logic now lives here.
 */
import { asc } from 'drizzle-orm';
import type { AccentName, Club } from '@/data/types';
import type { Db } from '@/db';
import { fetchResults } from '@/db/queries/results';
import { clubs } from '@/db/schema';
import { ClubHistory } from '@/server/domain/club-history';
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';
import { createSeasonsRepo } from '@/server/repos/seasons.repo';

const ACCENTS: readonly AccentName[] = [
    'pink',
    'deep',
    'lilac',
    'gold',
    'coral',
    'mint',
    'apricot',
    'violet',
    'forest',
    'rust',
    'slate',
    'ochre',
    'steel',
    'olive',
];

const MODULUS = 2_147_483_647;

/**
 * Stable string hash, modular rather than bitwise so it reads as arithmetic and
 * satisfies the no-bitwise rule.
 */
function hash(text: string): number {
    let h = 7;
    for (let i = 0; i < text.length; i += 1) {
        h = (h * 31 + text.charCodeAt(i)) % MODULUS;
    }
    return h;
}

/**
 * Accent from the club key rather than from its position in a list: a club must
 * keep its colour whether it is rendered from the club index, a ladder or a
 * profile, none of which share an ordering.
 */
export function accentFor(clubKey: string): AccentName {
    return ACCENTS[hash(clubKey) % ACCENTS.length];
}

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
} {
    return {
        async all(): Promise<readonly Club[]> {
            return fetchClubs(db);
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
