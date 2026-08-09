/**
 * The domain object for "one club's results across every season it fielded a
 * team". `sortClubResults` used to live as a free function in
 * `src/db/queries/club-profile.ts`, and `buildClubTrend` used to live as a
 * free function in `src/db/queries/club-trend.ts`; both now live here, and
 * their old homes delegate to this class.
 */
import type {
    Club,
    ClubBandTrend,
    ClubGradeResult,
    ClubTrend,
    ClubTrendPoint,
} from '@/data/types';
import type { TableState } from '@/db/queries/pagination';
import type { ResultRow } from '@/db/queries/results';
import { bandLabel } from '@/pipeline/scoring/bands';
import { meanStrength } from '@/pipeline/scoring/strength';
import type { TableQuery } from '@/server/domain/table-query';

function played(result: ClubGradeResult): number {
    return (result.won ?? 0) + (result.lost ?? 0) + (result.drawn ?? 0);
}

/** Two points for a win, one for a draw — same scoring as the ladder. */
function points(result: ClubGradeResult): number {
    return 2 * (result.won ?? 0) + (result.drawn ?? 0);
}

type ResultComparator = (a: ClubGradeResult, b: ClubGradeResult) => number;

function numeric(pick: (result: ClubGradeResult) => number): ResultComparator {
    return (a, b) => pick(a) - pick(b);
}

const RESULT_COMPARATORS: Record<string, ResultComparator> = {
    grade: (a, b) => a.gradeName.localeCompare(b.gradeName),
    position: numeric((result) => result.ladderPosition),
    played: numeric(played),
    won: numeric((result) => result.won ?? 0),
    lost: numeric((result) => result.lost ?? 0),
    points: numeric(points),
    year: (a, b) => a.year - b.year,
};

/**
 * Every sort ties back to (year desc, gradeKey asc). Without that tiebreaker,
 * seasons level on the sorted column can swap between requests and the same
 * grade finish appears on two pages — or on none.
 */
export function sortClubResults(
    results: readonly ClubGradeResult[],
    q: TableQuery,
): readonly ClubGradeResult[] {
    const { sort, desc } = q.state;
    const direction = desc ? -1 : 1;
    const compare = RESULT_COMPARATORS[sort] ?? RESULT_COMPARATORS.year;
    return [...results].sort((a, b) => {
        const primary = compare(a, b);
        if (primary !== 0) {
            return primary * direction;
        }
        return a.year === b.year
            ? a.gradeKey.localeCompare(b.gradeKey)
            : b.year - a.year;
    });
}

/** Most recent season first, then strongest grade first within a season. */
export function toGradeResults(
    rows: readonly ResultRow[],
): readonly ClubGradeResult[] {
    return [...rows].reverse().map(
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

export class ClubHistory {
    private readonly club: Club;
    private readonly resultsData: readonly ResultRow[];
    private readonly rankedYearsData: readonly number[];

    private constructor(
        club: Club,
        results: readonly ResultRow[],
        rankedYears: readonly number[],
    ) {
        this.club = club;
        this.resultsData = results;
        this.rankedYearsData = rankedYears;
    }

    public static from(
        club: Club,
        results: readonly ResultRow[],
        rankedYears: readonly number[],
    ): ClubHistory {
        return new ClubHistory(club, results, rankedYears);
    }

    public clubData(): Club {
        return this.club;
    }

    public trend(): ClubTrend {
        return buildClubTrend(this.resultsData, this.rankedYearsData);
    }

    public sortedResults(q: TableQuery): {
        readonly rows: readonly ClubGradeResult[];
        readonly totalRows: number;
        readonly state: TableState;
    } {
        return q.apply(toGradeResults(this.resultsData), sortClubResults);
    }

    /**
     * The most recent ranked year this club fielded a final-season team, or
     * `null` if it has never fielded one in a ranked year. A club is ranked
     * in every ranked year it played a final grade — `fetchChampionshipHistory`
     * builds its club index from the same final rows, so no club with a final
     * result in a ranked year is missing from that year's championship.
     */
    public lastRankedYear(): number | null {
        const years = this.resultsData
            .filter(
                (row) => row.isFinal && this.rankedYearsData.includes(row.year),
            )
            .map((row) => row.year);
        return years.length === 0 ? null : Math.max(...years);
    }
}
