/**
 * Orchestrates stage 1 of the pipeline: PlayHQ -> normalised CSVs under
 * `data/`. Thin CLI wrapper lives in `scripts/fetch-playhq.ts`; this module
 * holds the filesystem half — the collect itself lives in `collect.ts` so the
 * Worker can import it without `node:fs`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isUndefined } from 'es-toolkit';
import { parseCsv, toCsv } from '@/pipeline/csv';
import type { CsvValue } from '@/pipeline/csv';
import { createFsStore } from '@/pipeline/fetch/capture-store';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import { collectPlayHqData } from '@/pipeline/fetch/collect';
import type {
    FetchReport,
    GradeRow,
    SeasonRow,
    TeamRow,
} from '@/pipeline/fetch/collect';
import type { GameRow } from '@/pipeline/fetch/games';

// Re-exported so `scripts/`, tests and `to-import.ts` can keep treating this
// module as the fetch entrypoint while the Worker imports `collect.ts` alone.
export {
    AMND_ORG_ID,
    HILLS_ORG_ID,
    MID_HILLS_ORG_ID,
    NETBALL_SA_ORG_ID,
    SAUCNA_ORG_ID,
    SOUTHERN_HILLS_ORG_ID,
    SUNA_ORG_ID,
    collectJobsFor,
    collectPlayHqData,
    isCataloguedPlayHqCompetition,
    processGrade,
    resolveCompetitionKey,
    seasonWanted,
} from '@/pipeline/fetch/collect';
export type {
    CollectOptions,
    CollectedPlayHq,
    FetchReport,
    GradeContext,
    GradeRow,
    SeasonRow,
    TeamRow,
} from '@/pipeline/fetch/collect';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DATA_DIR = resolve(ROOT, 'data');
const RAW_DIR = resolve(DATA_DIR, 'raw');

export interface FetchOptions {
    refresh: boolean;
    /** Also fetch fixtures and write `data/games-<year>.csv`. */
    games?: boolean;
    /** Restrict collect to these season start years (ladders and games). Empty means all. */
    years?: readonly number[];
    /** Restrict the games fetch to a single PlayHQ grade id, for spot checks. */
    gradeId?: string;
    /** Restrict collect to these PlayHQ organisation IDs. */
    orgIds?: readonly string[];
}

async function readExistingCsv<T extends Record<string, string>>(
    fileName: string,
): Promise<T[]> {
    try {
        const text = await readFile(resolve(DATA_DIR, fileName), 'utf-8');
        // SAFETY: `parseCsv` returns `Record<string, string>[]` keyed by the
        // file's own header row; `T` is constrained to that same shape and
        // only ever narrows which header names the caller reads. Every caller
        // here reads columns this repo writes in `writeCsvs` below.
        return parseCsv(text) as T[];
    } catch {
        return [];
    }
}

/**
 * Team identity is `(grade_key, playhq_id)` — PlayHQ's own team id, stable
 * across re-scrapes regardless of which teammates exist in the club's
 * collision group. Never derived from position in a sorted group.
 */
function teamKeyOf(t: Record<string, CsvValue>): string {
    return `${String(t.grade_key)}|${String(t.playhq_id ?? '')}`;
}

function resultKeyOf(r: Record<string, CsvValue>): string {
    return `${String(r.grade_key)}|${String(r.ladder_position).padStart(4, '0')}`;
}

export interface ExistingCsvRows {
    readonly seasons: readonly Record<string, string>[];
    readonly grades: readonly Record<string, string>[];
    readonly teams: readonly Record<string, string>[];
    readonly results: readonly Record<string, string>[];
}

/**
 * The rows a PlayHQ run must carry over untouched.
 *
 * `runFetch` rewrites `seasons.csv`, `grades.csv`, `teams.csv` and
 * `team_season_results.csv` wholesale, but it only ever sees PlayHQ-era data.
 * The archive-PDF pipeline writes 2000-2016 into those same files, so without
 * this a single fetch deletes sixteen seasons of history that no re-run can
 * restore — the PDFs are a separate pipeline.
 *
 * A `--year` (or other subset) collect only accumulates those seasons, so
 * existing PlayHQ rows for season_keys this run did not fetch must also
 * survive. `fetchedSeasonKeys` omitted means "treat every PlayHQ season as
 * fetched" — the historical full-walk behaviour.
 *
 * `grades.csv` and `teams.csv` have no `source` column, so retention is
 * inherited: season -> grade -> team.
 */
export function archiveRowsToKeep(
    existing: ExistingCsvRows,
    fetchedSeasonKeys?: ReadonlySet<string>,
): ExistingCsvRows {
    const seasons = existing.seasons.filter((row) => {
        if (row.source !== 'playhq') {
            return true;
        }
        return (
            !isUndefined(fetchedSeasonKeys) &&
            !fetchedSeasonKeys.has(row.season_key)
        );
    });
    const seasonKeys = new Set(seasons.map((row) => row.season_key));
    const grades = existing.grades.filter((row) =>
        seasonKeys.has(row.season_key),
    );
    const gradeKeys = new Set(grades.map((row) => row.grade_key));
    return {
        grades,
        results: existing.results.filter(
            (row) => row.source !== 'playhq' || gradeKeys.has(row.grade_key),
        ),
        seasons,
        teams: existing.teams.filter((row) => gradeKeys.has(row.grade_key)),
    };
}

/** Sorted so a re-run diffs on real changes rather than row order. */
function gameKeyOf(row: GameRow): string {
    return `${row.grade_key}|${String(row.round ?? 0).padStart(4, '0')}|${row.playhq_id}`;
}

async function writeGamesCsvs(
    gamesByYear: ReadonlyMap<number, readonly GameRow[]>,
): Promise<number> {
    let total = 0;
    for (const [year, rows] of [...gamesByYear].toSorted(
        (a, b) => a[0] - b[0],
    )) {
        const sorted = rows.toSorted((a, b) =>
            gameKeyOf(a).localeCompare(gameKeyOf(b)),
        );
        // eslint-disable-next-line no-await-in-loop -- a handful of files, written in order for a stable log.
        await writeFile(
            resolve(DATA_DIR, `games-${String(year)}.csv`),
            toCsv(sorted),
            'utf-8',
        );
        total += sorted.length;
    }
    return total;
}

interface FetchedRows {
    readonly seasons: readonly SeasonRow[];
    readonly grades: readonly GradeRow[];
    readonly teams: readonly TeamRow[];
    readonly results: readonly Record<string, CsvValue>[];
}

/**
 * Sorts, merges the archive-PDF rows back in, and writes the shared CSVs.
 * Split out of `runFetch` to keep it under the function-length budget.
 */
async function writeCsvs(
    fetched: FetchedRows,
    existingSeasons: readonly Record<string, string>[],
    clubRegistry: ClubRegistry,
): Promise<{
    seasons: number;
    grades: number;
    teams: number;
    results: number;
}> {
    const [existingGrades, existingTeams, existingResults] = await Promise.all([
        readExistingCsv('grades.csv'),
        readExistingCsv('teams.csv'),
        readExistingCsv('team_season_results.csv'),
    ]);
    const archived = archiveRowsToKeep(
        {
            grades: existingGrades,
            results: existingResults,
            seasons: existingSeasons,
            teams: existingTeams,
        },
        new Set(fetched.seasons.map((row) => row.season_key)),
    );

    const seasons = [...fetched.seasons, ...archived.seasons].toSorted((a, b) =>
        a.season_key.localeCompare(b.season_key),
    );
    const grades = [...fetched.grades, ...archived.grades].toSorted((a, b) =>
        a.grade_key.localeCompare(b.grade_key),
    );
    const teams = [...fetched.teams, ...archived.teams].toSorted((a, b) =>
        teamKeyOf(a).localeCompare(teamKeyOf(b)),
    );
    const results = [...fetched.results, ...archived.results].toSorted((a, b) =>
        resultKeyOf(a).localeCompare(resultKeyOf(b)),
    );

    await writeFile(resolve(DATA_DIR, 'seasons.csv'), toCsv(seasons), 'utf-8');
    await writeFile(
        resolve(DATA_DIR, 'clubs.csv'),
        toCsv(clubRegistry.getClubs()),
        'utf-8',
    );
    await writeFile(
        resolve(DATA_DIR, 'club_aliases.csv'),
        toCsv(clubRegistry.getAliases()),
        'utf-8',
    );
    await writeFile(resolve(DATA_DIR, 'grades.csv'), toCsv(grades), 'utf-8');
    await writeFile(resolve(DATA_DIR, 'teams.csv'), toCsv(teams), 'utf-8');
    await writeFile(
        resolve(DATA_DIR, 'team_season_results.csv'),
        toCsv(results),
        'utf-8',
    );

    return {
        grades: grades.length,
        results: results.length,
        seasons: seasons.length,
        teams: teams.length,
    };
}

/** Loads the curated `clubs.csv`/`club_aliases.csv` state into a fresh registry. */
async function loadClubRegistry(): Promise<ClubRegistry> {
    const [clubRows, aliasRows] = await Promise.all([
        readExistingCsv<Record<string, string>>('clubs.csv'),
        readExistingCsv<Record<string, string>>('club_aliases.csv'),
    ]);
    const existingClubs = clubRows.map(
        (row): ClubRow => ({
            club_key: row.club_key,
            established_year:
                row.established_year === '' ? null : row.established_year,
            home_venue: row.home_venue === '' ? null : row.home_venue,
            name: row.name,
            playhq_id: row.playhq_id === '' ? null : row.playhq_id,
        }),
    );
    const existingAliases = aliasRows.map(
        (row): ClubAliasRow => ({
            alias_text: row.alias_text,
            club_key: row.club_key,
            source: row.source,
        }),
    );
    return new ClubRegistry(existingClubs, existingAliases);
}

export async function runFetch(options: FetchOptions): Promise<FetchReport> {
    await mkdir(RAW_DIR, { recursive: true });
    const store = createFsStore(RAW_DIR);

    const existingSeasons =
        await readExistingCsv<Record<string, string>>('seasons.csv');
    const isFinalBySeasonKey = new Map(
        existingSeasons.map((row) => [row.season_key, row.is_final]),
    );

    const clubRegistry = await loadClubRegistry();
    const collected = await collectPlayHqData({
        cacheFirst: !options.refresh,
        clubRegistry,
        games: options.games,
        gradeId: options.gradeId,
        isFinalBySeasonKey,
        orgIds: options.orgIds,
        store,
        years: options.years,
    });

    // Disjoint output files (`games-<year>.csv` vs the shared CSVs), so the
    // two writers can run together.
    const [written, games] = await Promise.all([
        writeCsvs(
            {
                grades: collected.grades,
                results: collected.results,
                seasons: collected.seasons,
                teams: collected.teams,
            },
            existingSeasons,
            clubRegistry,
        ),
        writeGamesCsvs(collected.gamesByYear),
    ]);

    return { ...written, games, skippedGrades: collected.report.skippedGrades };
}
