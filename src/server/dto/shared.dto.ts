/**
 * DTO types shared by more than one page. Moved from the deleted
 * `src/data/types.ts`, which these definitions replace — see the
 * page-specific `*.dto.ts` files for the rest. Deliberately absent: shots
 * attempted/scored. PlayHQ never exposes them, so no view may depend on them.
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

/**
 * Where consecutive ranked years switch measurement (e.g. archive Final
 * Premiership Placings → PlayHQ regular-season ladders).
 */
export interface MethodologyBreak {
    readonly afterYear: number;
    readonly beforeYear: number;
}

export interface TimelineGap {
    readonly afterYear: number;
    readonly missingYears: readonly number[];
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
    /** Null when every ranked year uses the same result source as its predecessor. */
    readonly methodologyBreak: MethodologyBreak | null;
    /** Calendar years with no ranked season between covered years. */
    readonly timelineGaps: readonly TimelineGap[];
}

export interface GradeSummary {
    readonly key: GradeKey;
    readonly name: string;
    readonly year: number;
    readonly competition: Competition;
    readonly teamCount: number;
}
