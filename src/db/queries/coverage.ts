import { asc, eq } from 'drizzle-orm';
import type {
    Competition,
    Coverage,
    CoverageChange,
    SeasonCoverage,
} from '@/data/types';
import type { Db } from '@/db';
import { methodologyBreak, timelineGaps } from '@/db/queries/era-break';
import { competitions, seasons } from '@/db/schema';
import type { Source } from '@/db/schema';

/**
 * Short forms for tight table cells. Not in the database: it is presentation,
 * and inventing an abbreviation by truncating the name reads badly.
 */
const SHORT_NAMES: Readonly<Record<string, string>> = {
    amnd: 'AMND',
    premier_league: 'Premier League',
    premier_league_reserves: 'PL Reserves',
};

export function toCompetition(key: string, name: string): Competition {
    return { key, name, shortName: SHORT_NAMES[key] ?? name };
}

export interface SeasonRow {
    readonly seasonId: number;
    readonly seasonKey: string;
    readonly startYear: number;
    readonly isFinal: boolean;
    readonly source: Source;
    readonly competitionKey: string;
    readonly competitionName: string;
}

export async function fetchSeasons(db: Db): Promise<readonly SeasonRow[]> {
    return db
        .select({
            seasonId: seasons.id,
            seasonKey: seasons.seasonKey,
            startYear: seasons.startYear,
            isFinal: seasons.isFinal,
            source: seasons.source,
            competitionKey: competitions.key,
            competitionName: competitions.name,
        })
        .from(seasons)
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .orderBy(asc(seasons.startYear), asc(competitions.id));
}

/** Every year the site holds any data for, ascending. */
export function coveredYears(rows: readonly SeasonRow[]): readonly number[] {
    return [...new Set(rows.map((row) => row.startYear))].sort((a, b) => a - b);
}

/**
 * A year is rankable only when every competition that ran it has finished. One
 * in-progress season would make the championship a partial count, which is
 * worse than no championship at all.
 */
export function rankedYears(rows: readonly SeasonRow[]): readonly number[] {
    return coveredYears(rows).filter((year) => {
        const inYear = rows.filter((row) => row.startYear === year);
        return (
            inYear.some((row) => row.isFinal) &&
            inYear.every((row) => row.isFinal)
        );
    });
}

function seasonCoverage(
    year: number,
    row: SeasonRow | undefined,
): SeasonCoverage {
    if (!row) {
        return {
            year,
            status: 'absent',
            note: `No season — the competition did not run in ${String(year)}.`,
        };
    }
    if (!row.isFinal) {
        return {
            year,
            status: 'in-progress',
            note: 'Season still being played, so it is not ranked yet.',
        };
    }
    return { year, status: 'ranked', note: null };
}

/**
 * The year competition coverage first widened beyond the dataset's first
 * year, and which competitions joined then — derived from each
 * competition's earliest covered year, not hardcoded to any particular
 * season. Null when every competition present anywhere in the dataset was
 * already present in the first year.
 */
export function coverageChangeNote(
    rows: readonly SeasonRow[],
): CoverageChange | null {
    const years = coveredYears(rows);
    const firstYear = years[0];
    if (firstYear === undefined) {
        return null;
    }
    const firstAppearance = new Map<string, number>();
    for (const row of rows) {
        const known = firstAppearance.get(row.competitionKey);
        if (known === undefined || row.startYear < known) {
            firstAppearance.set(row.competitionKey, row.startYear);
        }
    }
    const laterYears = [...firstAppearance.values()].filter(
        (year) => year > firstYear,
    );
    if (laterYears.length === 0) {
        return null;
    }
    const changeYear = Math.min(...laterYears);
    const addedCompetitions = [...firstAppearance.entries()]
        .filter(([, year]) => year === changeYear)
        .map(([key]) => {
            const named = rows.find((row) => row.competitionKey === key);
            return SHORT_NAMES[key] ?? named?.competitionName ?? key;
        });
    return { year: changeYear, addedCompetitions };
}

export function buildCoverage(
    rows: readonly SeasonRow[],
    isSampleData: boolean,
): Coverage {
    const years = coveredYears(rows);
    const ranked = rankedYears(rows);
    const keys = [...new Set(rows.map((row) => row.competitionKey))];
    const sourceByYear = new Map<number, Set<string>>();
    for (const row of rows) {
        if (!ranked.includes(row.startYear)) continue;
        const set = sourceByYear.get(row.startYear) ?? new Set<string>();
        set.add(row.source);
        sourceByYear.set(row.startYear, set);
    }
    return {
        years,
        rankedYears: ranked,
        isSampleData,
        changeNote: coverageChangeNote(rows),
        methodologyBreak: methodologyBreak({
            rankedYears: ranked,
            sourceByYear,
        }),
        timelineGaps: timelineGaps(ranked),
        competitions: keys.map((key) => {
            const forKey = rows.filter((row) => row.competitionKey === key);
            return {
                competition: toCompetition(
                    key,
                    forKey[0]?.competitionName ?? key,
                ),
                seasons: years.map((year) =>
                    seasonCoverage(
                        year,
                        forKey.find((row) => row.startYear === year),
                    ),
                ),
            };
        }),
    };
}
