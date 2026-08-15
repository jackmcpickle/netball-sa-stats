/**
 * The domain object for "one club's results across every season it fielded a
 * team". `sortClubResults` used to live as a free function in
 * `src/db/queries/club-profile.ts`, and `buildClubTrend` used to live as a
 * free function in `src/db/queries/club-trend.ts`; both now live here, and
 * their old homes delegate to this class.
 */
import type { ResultRow } from '@/db/queries/results';
import { bandLabel } from '@/pipeline/scoring/bands';
import { meanStrength } from '@/pipeline/scoring/strength';
import type {
    ClubBandTrend,
    ClubGradeResult,
    ClubTrend,
    ClubTrendPoint,
} from '@/server/dto/club-profile.dto';

/**
 * Narrows joined rows to what the results table renders. Order is the
 * caller's: SQL sorts and slices the page (`clubResultPageFor` in
 * `clubs.repo.ts`), so this must not reorder anything.
 */
export function toGradeResults(
    rows: readonly ResultRow[],
): readonly ClubGradeResult[] {
    return rows.map(
        (row): ClubGradeResult => ({
            year: row.year,
            gradeKey: row.gradeKey,
            gradeName: row.gradeName,
            competitionName: row.competitionName,
            ladderPosition: row.ladderPosition,
            teamCount: row.teamCount,
            won: row.won,
            lost: row.lost,
            drawn: row.drawn,
            percentage: row.percentage,
            notes: row.notes,
        }),
    );
}

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
function buildClubTrend(
    rows: readonly ResultRow[],
    rankedYears: readonly number[],
): ClubTrend {
    const ranked = rows.filter((row) => row.isFinal);
    const tiers = [...new Set(ranked.map((row) => row.tier))].toSorted(
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

export class ClubHistory {
    private readonly resultsData: readonly ResultRow[];
    private readonly rankedYearsData: readonly number[];

    private constructor(
        results: readonly ResultRow[],
        rankedYears: readonly number[],
    ) {
        this.resultsData = results;
        this.rankedYearsData = rankedYears;
    }

    public static from(
        results: readonly ResultRow[],
        rankedYears: readonly number[],
    ): ClubHistory {
        return new ClubHistory(results, rankedYears);
    }

    public trend(): ClubTrend {
        return buildClubTrend(this.resultsData, this.rankedYearsData);
    }
}
