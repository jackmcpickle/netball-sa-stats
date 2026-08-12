/**
 * The domain object for "which clubs are currently active".
 */
import type { Club } from '@/server/dto/shared.dto';

export interface ClubPartition {
    readonly present: readonly Club[];
    readonly past: readonly Club[];
}

/**
 * A club is "present" when it holds a championship rank in the latest
 * ranked year — the same fact the club card already prints. Ranked keys
 * with no club are ignored rather than fabricated: the club list is the
 * authority on which clubs exist.
 */
export function partitionClubs(
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
