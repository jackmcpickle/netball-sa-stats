/**
 * Every finished season's results, ranked. `fetchChampionshipHistory` used to
 * live in `src/db/queries/championship.ts`; that fetch + assembly logic now
 * lives here, and the old module keeps only `CHAMPIONSHIP_TABLE_SPEC`.
 */
import type { Db } from '@/db';
import {
    movementBoundaryChanged,
    placementBasesForYear,
    sourcesForYear,
} from '@/db/queries/era-break';
import { fetchResults, toScoringRow } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { previousRanks, rankSeasons } from '@/pipeline/scoring/championship';
import type {
    ChampionshipRow,
    ChampionshipSeason,
} from '@/server/dto/rankings.dto';
import type { Club } from '@/server/dto/shared.dto';
import { accentFor } from '@/server/repos/clubs.repo';

function competitionKeysFor(
    rows: readonly ResultRow[],
    year: number,
): ReadonlySet<string> {
    return new Set(
        rows
            .filter((row) => row.year === year)
            .map((row) => row.competitionKey),
    );
}

function clubIndexFrom(rows: readonly ResultRow[]): ReadonlyMap<string, Club> {
    const index = new Map<string, Club>();
    for (const row of rows) {
        if (!index.has(row.clubKey)) {
            index.set(row.clubKey, {
                key: row.clubKey,
                name: row.clubName,
                establishedYear: row.establishedYear,
                homeVenue: row.homeVenue,
                accent: accentFor(row.clubKey),
            });
        }
    }
    return index;
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
    const clubs = clubIndexFrom(rows);
    const ranked = rankSeasons(rows.map(toScoringRow));

    return ranked.map((season, index): ChampionshipSeason => {
        const previousSeason = ranked[index - 1];
        const previous = previousRanks(previousSeason);
        // Movement is only meaningful across adjacent, comparable seasons.
        // Suppress when competitions widen, calendar years gap (2016→2022),
        // or methodology changes (archive Final Premiership Placings → PlayHQ
        // regular-season ladders).
        const coverageChanged =
            previousSeason !== undefined &&
            movementBoundaryChanged({
                year: season.year,
                previousYear: previousSeason.year,
                competitionKeys: competitionKeysFor(rows, season.year),
                previousCompetitionKeys: competitionKeysFor(
                    rows,
                    previousSeason.year,
                ),
                sources: sourcesForYear(rows, season.year),
                previousSources: sourcesForYear(rows, previousSeason.year),
                placementBases: placementBasesForYear(rows, season.year),
                previousPlacementBases: placementBasesForYear(
                    rows,
                    previousSeason.year,
                ),
            });
        const championshipRows = season.totals.flatMap(
            (total): ChampionshipRow[] => {
                const club = clubs.get(total.clubKey);
                if (!club) {
                    return [];
                }
                return [
                    {
                        rank: total.rank,
                        club,
                        points: total.points,
                        teams: total.teams,
                        winPercentage: total.winPercentage,
                        minorPremierships: total.minorPremierships,
                        // Null in the first ranked season by construction
                        // (`previousRanks(undefined)` is empty), and also
                        // whenever coverage changed since the prior season.
                        previousRank: coverageChanged
                            ? null
                            : (previous.get(total.clubKey) ?? null),
                    },
                ];
            },
        );
        return { year: season.year, rows: championshipRows, coverageChanged };
    });
}

export function createChampionshipRepo(db: Db): {
    history(): Promise<readonly ChampionshipSeason[]>;
} {
    return {
        async history(): Promise<readonly ChampionshipSeason[]> {
            return fetchChampionshipHistory(db);
        },
    };
}
