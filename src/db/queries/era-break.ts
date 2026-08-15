/**
 * When consecutive ranked seasons are not comparable for movement arrows:
 * different competition sets, a calendar gap, or a methodology/source change
 * (archive Final Premiership Placings → PlayHQ regular-season ladders).
 */

export function sourcesForYear(
    rows: readonly { readonly year: number; readonly source: string }[],
    year: number,
): ReadonlySet<string> {
    return new Set(
        rows.filter((row) => row.year === year).map((row) => row.source),
    );
}

export function placementBasesForYear(
    rows: readonly {
        readonly year: number;
        readonly placementBasis: string;
    }[],
    year: number,
): ReadonlySet<string> {
    return new Set(
        rows
            .filter((row) => row.year === year)
            .map((row) => row.placementBasis),
    );
}

export function sameStringSet(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
): boolean {
    return a.size === b.size && [...a].every((key) => b.has(key));
}

/**
 * True when movement from `previousYear` → `year` must be suppressed.
 * `previousYear` is the prior ranked year (may be non-adjacent).
 */
export function movementBoundaryChanged(args: {
    readonly year: number;
    readonly previousYear: number;
    readonly competitionKeys: ReadonlySet<string>;
    readonly previousCompetitionKeys: ReadonlySet<string>;
    readonly sources: ReadonlySet<string>;
    readonly previousSources: ReadonlySet<string>;
    readonly placementBases: ReadonlySet<string>;
    readonly previousPlacementBases: ReadonlySet<string>;
}): boolean {
    if (args.year - args.previousYear > 1) {
        return true;
    }
    if (!sameStringSet(args.competitionKeys, args.previousCompetitionKeys)) {
        return true;
    }
    if (!sameStringSet(args.sources, args.previousSources)) {
        return true;
    }
    if (!sameStringSet(args.placementBases, args.previousPlacementBases)) {
        return true;
    }
    return false;
}

/** Calendar gaps between sorted ranked years, for timeline break rendering. */
export function timelineGaps(rankedYears: readonly number[]): readonly {
    readonly afterYear: number;
    readonly missingYears: readonly number[];
}[] {
    const gaps: { afterYear: number; missingYears: number[] }[] = [];
    for (let i = 1; i < rankedYears.length; i += 1) {
        const prev = rankedYears[i - 1];
        const next = rankedYears[i];
        if (prev === undefined || next === undefined) {
            continue;
        }
        if (next - prev <= 1) {
            continue;
        }
        const missing: number[] = [];
        for (let year = prev + 1; year < next; year += 1) {
            missing.push(year);
        }
        gaps.push({ afterYear: prev, missingYears: missing });
    }
    return gaps;
}

/**
 * First methodology break between consecutive ranked years (archive → PlayHQ).
 * Null when every ranked year shares one source set with its predecessor.
 */
export function methodologyBreak(args: {
    readonly rankedYears: readonly number[];
    readonly sourceByYear: ReadonlyMap<number, ReadonlySet<string>>;
}): { readonly afterYear: number; readonly beforeYear: number } | null {
    for (let i = 1; i < args.rankedYears.length; i += 1) {
        const prev = args.rankedYears[i - 1];
        const next = args.rankedYears[i];
        if (prev === undefined || next === undefined) {
            continue;
        }
        const previousSources = args.sourceByYear.get(prev) ?? new Set();
        const sources = args.sourceByYear.get(next) ?? new Set();
        if (!sameStringSet(previousSources, sources)) {
            return { afterYear: prev, beforeYear: next };
        }
    }
    return null;
}
