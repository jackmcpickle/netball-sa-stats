import type { ChampionshipRow, ChampionshipSeason, Club } from '@/data/types';
import type { Db } from '@/db';
import { accentFor } from '@/db/queries/clubs';
import { fetchResults, toScoringRow } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { previousRanks, rankSeasons } from '@/pipeline/scoring/championship';

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

function sameCompetitions(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
): boolean {
    return a.size === b.size && [...a].every((key) => b.has(key));
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
        // Movement is only meaningful when the same competitions ran in both
        // seasons — e.g. Premier League and Reserves entering in 2023 gives
        // every club fielding a Premier side a coverage-driven points jump
        // that has nothing to do with performance, so no season-index > 0
        // comparison across that boundary may claim it.
        const coverageChanged =
            previousSeason !== undefined &&
            !sameCompetitions(
                competitionKeysFor(rows, season.year),
                competitionKeysFor(rows, previousSeason.year),
            );
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
