import type { ChampionshipRow, ChampionshipSeason, Club } from '@/data/types';
import type { Db } from '@/db';
import { accentFor } from '@/db/queries/clubs';
import { fetchResults, toScoringRow } from '@/db/queries/results';
import type { ResultRow } from '@/db/queries/results';
import { previousRanks, rankSeasons } from '@/pipeline/scoring/championship';

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
        const previous = previousRanks(ranked[index - 1]);
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
                        // Null in the first ranked season by construction:
                        // `previousRanks(undefined)` is empty.
                        previousRank: previous.get(total.clubKey) ?? null,
                    },
                ];
            },
        );
        return { year: season.year, rows: championshipRows };
    });
}
