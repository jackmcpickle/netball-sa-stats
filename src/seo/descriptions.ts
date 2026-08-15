/**
 * One-sentence factual summaries built from loaded data. Used for meta
 * descriptions and for the opening line of the markdown twin, so both say the
 * same thing and both stay true when the data changes.
 */
import { isNull } from 'es-toolkit';
import type { ClubProfile } from '@/server/dto/club-profile.dto';

export function ordinal(value: number): string {
    const remainderTen = value % 10;
    const remainderHundred = value % 100;
    if (remainderTen === 1 && remainderHundred !== 11) {
        return `${value}st`;
    }
    if (remainderTen === 2 && remainderHundred !== 12) {
        return `${value}nd`;
    }
    if (remainderTen === 3 && remainderHundred !== 13) {
        return `${value}rd`;
    }
    return `${value}th`;
}

/** e.g. "Matrics ranks 3rd of the 2025 season …". */
export function describeClub(
    profile: Pick<
        ClubProfile,
        | 'club'
        | 'currentRank'
        | 'bestRank'
        | 'bestRankYear'
        | 'careerPoints'
        | 'minorPremierships'
        | 'seasons'
    >,
): string {
    const { name } = profile.club;
    const years = profile.seasons.map((season) => season.year);
    const span =
        years.length === 0
            ? 'no ranked seasons yet'
            : `seasons ${Math.min(...years)}–${Math.max(...years)}`;
    const rank = isNull(profile.currentRank)
        ? 'currently unranked'
        : `ranked ${ordinal(profile.currentRank)} in the latest ranked season`;
    const best =
        isNull(profile.bestRank) || isNull(profile.bestRankYear)
            ? ''
            : `, best finish ${ordinal(profile.bestRank)} in ${profile.bestRankYear}`;
    return `${name} in South Australian netball: ${rank}${best}, ${profile.careerPoints.toLocaleString('en-AU')} career championship points and ${profile.minorPremierships} minor premierships across ${span}.`;
}
