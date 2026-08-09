import type { Club } from '@/data/types';

export interface ClubPartition {
    readonly present: readonly Club[];
    readonly past: readonly Club[];
}

/**
 * A club is "present" when it holds a championship rank in the latest ranked
 * year — the same fact the club card already prints. Ranked keys with no club
 * are ignored rather than fabricated: the club list is the authority on which
 * clubs exist.
 */
export function partitionClubs(
    clubs: readonly Club[],
    rankedClubKeys: ReadonlySet<string>,
): ClubPartition {
    const present: Club[] = [];
    const past: Club[] = [];
    for (const club of clubs) {
        if (rankedClubKeys.has(club.key)) {
            present.push(club);
        } else {
            past.push(club);
        }
    }
    return { present, past };
}
