/**
 * The domain object for "which clubs are currently active". `partitionClubs`
 * used to live as a free function in `src/db/queries/club-activity.ts`; that
 * logic now lives here, and the query module delegates to it.
 */
import type { Club } from '@/server/dto/shared.dto';

export interface ClubPartition {
    readonly present: readonly Club[];
    readonly past: readonly Club[];
}

/**
 * A stateless partition has no instance to hold, but this stays a class
 * (rather than a free function) to match the other domain objects'
 * `Class.staticFactory()` shape.
 */
// oxlint-disable-next-line no-extraneous-class
export class ClubDirectory {
    /**
     * A club is "present" when it holds a championship rank in the latest
     * ranked year — the same fact the club card already prints. Ranked keys
     * with no club are ignored rather than fabricated: the club list is the
     * authority on which clubs exist.
     */
    public static partition(
        clubs: readonly Club[],
        ranked: ReadonlySet<string>,
    ): ClubPartition {
        const present: Club[] = [];
        const past: Club[] = [];
        for (const club of clubs) {
            if (ranked.has(club.key)) {
                present.push(club);
            } else {
                past.push(club);
            }
        }
        return { present, past };
    }
}
