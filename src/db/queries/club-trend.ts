import type { ClubBandTrend, ClubTrend, ClubTrendPoint } from '@/data/types';
import type { ResultRow } from '@/db/queries/results';
import { bandLabel } from '@/pipeline/scoring/bands';
import { meanStrength } from '@/pipeline/scoring/strength';

function pointsForYears(
    rows: readonly ResultRow[],
    years: readonly number[],
): readonly ClubTrendPoint[] {
    return years.map((year): ClubTrendPoint => {
        const yearRows = rows.filter((row) => row.year === year);
        return {
            year,
            strength: meanStrength(yearRows),
            teams: yearRows.length,
        };
    });
}

/**
 * Strength is a mean and scale is a count, so a club that sheds weak teams
 * shows strength up and scale down — the story the championship sum hides.
 */
export function buildClubTrend(
    rows: readonly ResultRow[],
    rankedYears: readonly number[],
): ClubTrend {
    const ranked = rows.filter((row) => row.isFinal);
    const tiers = [...new Set(ranked.map((row) => row.tier))].sort(
        (a, b) => a - b,
    );
    return {
        overall: pointsForYears(ranked, rankedYears),
        bands: tiers.map(
            (tier): ClubBandTrend => ({
                tier,
                label: bandLabel(tier),
                points: pointsForYears(
                    ranked.filter((row) => row.tier === tier),
                    rankedYears,
                ),
            }),
        ),
    };
}
