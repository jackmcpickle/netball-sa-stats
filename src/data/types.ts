/**
 * The shape the UI needs. Task 5 satisfies these types with sample data; the
 * championship-scoring task and the database wiring in Task 6 must conform to
 * them (or we reconcile explicitly), so that swapping the source touches only
 * `src/data/index.ts` and no component.
 *
 * Deliberately absent: shots attempted/scored. PlayHQ never exposes them, so no
 * view may depend on them.
 */

/** Stable slug, e.g. `matrics`. Mirrors `clubs.club_key`. */
export type ClubKey = string;

/** Stable slug, e.g. `amnd-winter-2024-b1`. Mirrors `grades.grade_key`. */
export type GradeKey = string;

/** Stable slug, e.g. `amnd`. Mirrors `competitions.key`. */
export type CompetitionKey = string;

/**
 * Named accent from `@theme`, not a hex value. Components render it through a
 * lookup so the palette stays in the stylesheet.
 */
export type AccentName =
    | 'pink'
    | 'deep'
    | 'lilac'
    | 'gold'
    | 'coral'
    | 'mint'
    | 'apricot'
    | 'violet'
    | 'forest'
    | 'rust'
    | 'slate'
    | 'ochre'
    | 'steel'
    | 'olive';

export interface Club {
    readonly key: ClubKey;
    readonly name: string;
    /** Null wherever PlayHQ does not publish it, which is currently always. */
    readonly establishedYear: number | null;
    readonly homeVenue: string | null;
    readonly accent: AccentName;
}

export interface Competition {
    readonly key: CompetitionKey;
    readonly name: string;
    /** Short form for tight table cells, e.g. `AMND`. */
    readonly shortName: string;
}

/**
 * A competition's presence in one calendar year. `absent` is a real-world
 * non-event (Premier League did not run in 2022) and must never be rendered as
 * missing or unknown data.
 */
export type SeasonStatus = 'ranked' | 'in-progress' | 'absent';

export interface SeasonCoverage {
    readonly year: number;
    readonly status: SeasonStatus;
    /** Why, when the status is not `ranked`. Shown verbatim in the UI. */
    readonly note: string | null;
}

export interface CompetitionCoverage {
    readonly competition: Competition;
    readonly seasons: readonly SeasonCoverage[];
}

/**
 * The year competition coverage first widened, and what joined. Derived from
 * the data (each competition's earliest covered year), never hardcoded — the
 * next competition to be added should surface here without a code change.
 */
export interface CoverageChange {
    readonly year: number;
    readonly addedCompetitions: readonly string[];
}

export interface Coverage {
    /** Every year the site holds any data for, ascending. */
    readonly years: readonly number[];
    /** Years that carry a complete, rankable championship, ascending. */
    readonly rankedYears: readonly number[];
    readonly competitions: readonly CompetitionCoverage[];
    /** True while the site ships generated data rather than the real import. */
    readonly isSampleData: boolean;
    /**
     * Null when every competition has been covered since the first year in
     * the dataset. Otherwise the first year new competitions joined — the
     * championship total either side of it is not an apples-to-apples
     * comparison, so movement arrows across that boundary are suppressed.
     */
    readonly changeNote: CoverageChange | null;
}

/** One club's line in one season's championship table. */
export interface ChampionshipRow {
    readonly rank: number;
    readonly club: Club;
    readonly points: number;
    readonly teams: number;
    /** Null when no grade in that season reported win/loss counts. */
    readonly winPercentage: number | null;
    /** Grade ladders topped — minor premierships, not finals flags. */
    readonly minorPremierships: number;
    /**
     * Null in the first covered season, where there is nothing to compare to
     * — and also whenever `ChampionshipSeason.coverageChanged` is true for
     * this row's season, since the previous season's field was structurally
     * different and a rank comparison would misrepresent movement.
     */
    readonly previousRank: number | null;
}

export interface ChampionshipSeason {
    readonly year: number;
    readonly rows: readonly ChampionshipRow[];
    /**
     * True when this season's set of competitions differs from the previous
     * ranked season's — e.g. Premier League and Reserves entering in 2023.
     * The UI must not draw a movement arrow across that boundary.
     */
    readonly coverageChanged: boolean;
}

/** One club's championship rank in one year, for the movement chart. */
export interface RankPoint {
    readonly year: number;
    readonly rank: number;
    readonly points: number;
}

export interface ClubRankSeries {
    readonly club: Club;
    readonly points: readonly RankPoint[];
}

/** One team's finish in one grade, for the club profile table. */
export interface ClubGradeResult {
    readonly year: number;
    readonly gradeKey: GradeKey;
    readonly gradeName: string;
    readonly competitionName: string;
    readonly ladderPosition: number;
    readonly teamCount: number;
    readonly won: number | null;
    readonly lost: number | null;
    readonly drawn: number | null;
    readonly percentage: number | null;
    /** Provenance note, e.g. PlayHQ's played count not reconciling with W+D+L. */
    readonly notes: string | null;
}

/** One bar in the championship-points-by-season chart. */
export interface ClubSeasonPoints {
    readonly year: number;
    readonly points: number;
    /** Null when the club fielded no team, or the year is not yet ranked. */
    readonly rank: number | null;
    readonly status: SeasonStatus;
}

export interface ClubProfile {
    readonly club: Club;
    readonly currentRank: number | null;
    readonly bestRank: number | null;
    readonly bestRankYear: number | null;
    readonly careerPoints: number;
    readonly minorPremierships: number;
    readonly winPercentage: number | null;
    readonly gamesPlayed: number;
    readonly seasons: readonly ClubSeasonPoints[];
    readonly results: readonly ClubGradeResult[];
}

export interface LadderRow {
    readonly position: number;
    readonly club: Club;
    /** Includes the squad number where a club fields more than one team. */
    readonly displayName: string;
    readonly played: number | null;
    readonly won: number | null;
    readonly lost: number | null;
    readonly drawn: number | null;
    readonly goalsFor: number | null;
    readonly goalsAgainst: number | null;
    readonly percentage: number | null;
    readonly points: number | null;
    /** Provenance note, e.g. PlayHQ's played count not reconciling with W+D+L. */
    readonly notes: string | null;
}

export interface GradeSummary {
    readonly key: GradeKey;
    readonly name: string;
    readonly year: number;
    readonly competition: Competition;
    readonly teamCount: number;
}

export interface Ladder {
    readonly grade: GradeSummary;
    readonly rows: readonly LadderRow[];
}

/** A row of the published weighting table on the Method page. */
export interface GradeWeightRow {
    readonly competitionName: string;
    readonly label: string;
    readonly tier: number;
    readonly division: number | null;
    readonly weight: number;
}
