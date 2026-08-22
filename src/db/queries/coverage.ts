import { isUndefined } from 'es-toolkit';
import { methodologyBreak, timelineGaps } from '@/db/queries/era-break';
import type { SeasonRow } from '@/db/queries/seasons';
import { Coverage as CoverageDomain } from '@/server/domain/coverage';
import type {
    Competition,
    Coverage,
    CoverageChange,
    SeasonCoverage,
} from '@/server/dto/shared.dto';

export type { SeasonRow } from '@/db/queries/seasons';
export { fetchSeasons } from '@/db/queries/seasons';

/** The site now ships the real import rather than generated rows. */
export const IS_SAMPLE_DATA = false;

/**
 * Short forms for tight table cells. Not in the database: it is presentation,
 * and inventing an abbreviation by truncating the name reads badly.
 */
const SHORT_NAMES = new Map<string, string>([
    ['amnd', 'AMND'],
    ['premier_league', 'Premier League'],
    ['premier_league_reserves', 'PL Reserves'],
    ['saucna', 'SAUCNA'],
    ['suna', 'SUNA'],
    ['elizabeth', 'Elizabeth'],
    ['sammna', 'SAMMNA'],
    ['city_night_division', 'City Night'],
    ['sadna', 'SADNA'],
    ['hills', 'Hills'],
    ['mid_hills', 'Mid Hills'],
    ['shna', 'SHNA'],
    ['gsna', 'GSNA'],
    ['barossa', 'Barossa'],
    ['gawler', 'Gawler'],
    ['whyalla', 'Whyalla'],
    ['port_pirie', 'Port Pirie'],
    ['port_lincoln', 'Port Lincoln'],
    ['riverland', 'Riverland'],
    ['river_murray', 'River Murray'],
    ['northern_areas', 'Northern Areas'],
    ['eastern_eyre', 'Eastern Eyre'],
]);

export function toCompetition(key: string, name: string): Competition {
    return { key, name, shortName: SHORT_NAMES.get(key) ?? name };
}

function seasonCoverage(
    year: number,
    row: SeasonRow | undefined,
): SeasonCoverage {
    if (!row) {
        return {
            note: `No season — the competition did not run in ${String(year)}.`,
            status: 'absent',
            year,
        };
    }
    if (!row.isFinal) {
        return {
            note: 'Season still being played, so it is not ranked yet.',
            status: 'in-progress',
            year,
        };
    }
    return { note: null, status: 'ranked', year };
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
    const years = CoverageDomain.from(rows).years();
    const [firstYear] = years;
    if (isUndefined(firstYear)) {
        return null;
    }
    const firstAppearance = new Map<string, number>();
    // First-wins, matching the `rows.find` this replaced: the name is the one
    // carried by the earliest row for that key.
    const nameByKey = new Map<string, string>();
    for (const row of rows) {
        const known = firstAppearance.get(row.competitionKey);
        if (isUndefined(known) || row.startYear < known) {
            firstAppearance.set(row.competitionKey, row.startYear);
        }
        if (!nameByKey.has(row.competitionKey)) {
            nameByKey.set(row.competitionKey, row.competitionName);
        }
    }
    const laterYears = [...firstAppearance.values()].filter(
        (year) => year > firstYear,
    );
    if (laterYears.length === 0) {
        return null;
    }
    const changeYear = Math.min(...laterYears);
    const addedCompetitions: string[] = [];
    for (const [key, year] of firstAppearance) {
        if (year === changeYear) {
            addedCompetitions.push(
                SHORT_NAMES.get(key) ?? nameByKey.get(key) ?? key,
            );
        }
    }
    return { addedCompetitions, year: changeYear };
}

export function buildCoverage(
    rows: readonly SeasonRow[],
    isSampleData: boolean,
): Coverage {
    const coverage = CoverageDomain.from(rows);
    const years = coverage.years();
    const ranked = coverage.rankedYears();
    const rankedSet = new Set(ranked);
    const keys = [...new Set(rows.map((row) => row.competitionKey))];
    const sourceByYear = new Map<number, Set<string>>();
    for (const row of rows) {
        if (!rankedSet.has(row.startYear)) {
            continue;
        }
        const set = sourceByYear.get(row.startYear) ?? new Set<string>();
        set.add(row.source);
        sourceByYear.set(row.startYear, set);
    }
    return {
        changeNote: coverageChangeNote(rows),
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
        isSampleData,
        methodologyBreak: methodologyBreak({
            rankedYears: ranked,
            sourceByYear,
        }),
        rankedYears: ranked,
        timelineGaps: timelineGaps(ranked),
        years,
    };
}
