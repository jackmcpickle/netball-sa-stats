/**
 * Every finished season's results, ranked. `fetchChampionshipHistory` used to
 * live in `src/db/queries/championship.ts`; that fetch + assembly logic now
 * lives here, and the old module keeps only `CHAMPIONSHIP_TABLE_SPEC`.
 */
import { isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import {
    movementBoundaryChanged,
    placementBasesForYear,
    sourcesForYear,
} from '@/db/queries/era-break';
import { fetchResults, toScoringRow } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { previousRanks, rankSeasons } from '@/pipeline/scoring/championship';
import { championshipCompetitionKeys } from '@/pipeline/seed/catalogue';
import type {
    ChampionshipRow,
    ChampionshipSeason,
} from '@/server/dto/rankings.dto';
import type { Club } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/club-accent';

function competitionKeysFor(
    rows: readonly ResultRow[],
    year: number,
): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const row of rows) {
        if (row.year === year) {
            keys.add(row.competitionKey);
        }
    }
    return keys;
}

function clubIndexFrom(rows: readonly ResultRow[]): ReadonlyMap<string, Club> {
    const index = new Map<string, Club>();
    for (const row of rows) {
        if (!index.has(row.clubKey)) {
            index.set(row.clubKey, {
                accent: accentFor(row.clubKey),
                establishedYear: row.establishedYear,
                homeVenue: row.homeVenue,
                key: row.clubKey,
                name: row.clubName,
            });
        }
    }
    return index;
}

/**
 * Association ladders stay out of the AMND/PL championship until those
 * competitions have calibrated `grade_weights` / BANDS entries.
 */
export function rowsForChampionship(
    rows: readonly ResultRow[],
): readonly ResultRow[] {
    const keys = championshipCompetitionKeys();
    return rows.filter((row) => keys.has(row.competitionKey));
}

/**
 * Every finished season, ranked, oldest first.
 *
 * `finalOnly` is what keeps an in-progress season out of the championship: the
 * exclusion happens in the query, so no caller can forget it. The same rows
 * remain visible through the ladder queries, which do not filter.
 */
export async function fetchChampionshipHistory(
    db: Db,
): Promise<readonly ChampionshipSeason[]> {
    const rows = await fetchResults(db, { finalOnly: true });
    const scored = rowsForChampionship(rows);
    const clubs = clubIndexFrom(scored);
    const ranked = rankSeasons(scored.map(toScoringRow));

    return ranked.map((season, index): ChampionshipSeason => {
        const previousSeason = ranked[index - 1];
        const previous = previousRanks(previousSeason);
        // Movement is only meaningful across adjacent, comparable seasons.
        // Suppress when competitions widen, calendar years gap (2016→2022),
        // or methodology changes (archive Final Premiership Placings → PlayHQ
        // regular-season ladders).
        const coverageChanged =
            !isUndefined(previousSeason) &&
            movementBoundaryChanged({
                competitionKeys: competitionKeysFor(scored, season.year),
                placementBases: placementBasesForYear(scored, season.year),
                previousCompetitionKeys: competitionKeysFor(
                    scored,
                    previousSeason.year,
                ),
                previousPlacementBases: placementBasesForYear(
                    scored,
                    previousSeason.year,
                ),
                previousSources: sourcesForYear(scored, previousSeason.year),
                previousYear: previousSeason.year,
                sources: sourcesForYear(scored, season.year),
                year: season.year,
            });
        const championshipRows = season.totals.flatMap(
            (total): ChampionshipRow[] => {
                const club = clubs.get(total.clubKey);
                if (!club) {
                    return [];
                }
                return [
                    {
                        club,
                        minorPremierships: total.minorPremierships,
                        points: total.points,
                        // Null in the first ranked season by construction
                        // (`previousRanks(undefined)` is empty), and also
                        // whenever coverage changed since the prior season.
                        previousRank: coverageChanged
                            ? null
                            : (previous.get(total.clubKey) ?? null),
                        rank: total.rank,
                        teams: total.teams,
                        winPercentage: total.winPercentage,
                    },
                ];
            },
        );
        return { coverageChanged, rows: championshipRows, year: season.year };
    });
}

export interface ChampionshipRepo {
    readonly history: () => Promise<readonly ChampionshipSeason[]>;
}

export function createChampionshipRepo(db: Db): ChampionshipRepo {
    return {
        async history(): Promise<readonly ChampionshipSeason[]> {
            return await fetchChampionshipHistory(db);
        },
    };
}
