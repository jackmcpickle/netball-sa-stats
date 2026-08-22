/**
 * Orchestrates the Node CLI fetch: PlayHQ -> D1, with a local raw cache
 * under `data/raw/` (gitignored). Thin wrapper lives in
 * `scripts/fetch-playhq.ts`. Collect itself lives in `collect.ts` so the
 * Worker can import it without `node:fs`. Generated entity CSVs are not
 * written — D1 is the store. Curated `clubs.csv` / `club_aliases.csv` are
 * the only files fetch may update, so new PlayHQ clubs can be reviewed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isUndefined } from 'es-toolkit';
import { parseCsv, toCsv } from '@/pipeline/csv';
import type { CsvValue } from '@/pipeline/csv';
import { createFsStore } from '@/pipeline/fetch/capture-store';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import { clubRegistryFromExecutor } from '@/pipeline/fetch/club-registry-from-db';
import { collectPlayHqData } from '@/pipeline/fetch/collect';
import type {
    CollectOptions,
    CollectedPlayHq,
    FetchReport,
} from '@/pipeline/fetch/collect';
import type { GameRow } from '@/pipeline/fetch/games';
import { loadIsFinalMap } from '@/pipeline/import/playhq-job';
import { runImportData } from '@/pipeline/import/run';
import type { ImportReport } from '@/pipeline/import/run';
import type { ImportExecutor } from '@/pipeline/import/types';

// Re-exported so `scripts/`, tests and `to-import.ts` can keep treating this
// module as the fetch entrypoint while the Worker imports `collect.ts` alone.
export {
    AMND_ORG_ID,
    CITY_NIGHT_ORG_ID,
    ELIZABETH_ORG_ID,
    NETBALL_SA_ORG_ID,
    SAMMNA_ORG_ID,
    SAUCNA_ORG_ID,
    SUNA_ORG_ID,
    associationCollectOrgIds,
    associationSeasonWanted,
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
    /** Also fetch fixtures and upsert games. */
    games?: boolean;
    /** Restrict collect to these season start years (ladders and games). Empty means all. */
    years?: readonly number[];
    /** Restrict the games fetch to a single PlayHQ grade id, for spot checks. */
    gradeId?: string;
    /** Restrict collect to these PlayHQ organisation IDs. */
    orgIds?: readonly string[];
    /** Local or remote D1. Required — fetch upserts, it does not write entity CSVs. */
    executor: ImportExecutor;
    /**
     * Override the curated-CSV directory (tests). Defaults to `data/`.
     * Fetch may write `clubs.csv` / `club_aliases.csv` here; never entity dumps.
     */
    dataDir?: string;
    /** Override the raw-capture cache directory (tests). Defaults to `data/raw/`. */
    rawDir?: string;
    collect?: (options: CollectOptions) => Promise<CollectedPlayHq>;
}

export interface FetchToD1Report extends FetchReport {
    imported: ImportReport;
}

const CLUB_COLUMNS = [
    'club_key',
    'name',
    'established_year',
    'home_venue',
    'playhq_id',
] as const;

const ALIAS_COLUMNS = ['club_key', 'alias_text', 'source'] as const;

async function readExistingCsv<T extends Record<string, string>>(
    dataDir: string,
    fileName: string,
): Promise<T[]> {
    try {
        const text = await readFile(resolve(dataDir, fileName), 'utf-8');
        // SAFETY: `parseCsv` returns `Record<string, string>[]` keyed by the
        // file's own header row; `T` is constrained to that same shape and
        // only ever narrows which header names the caller reads. Curated
        // club files use a known header list.
        return parseCsv(text) as T[];
    } catch {
        return [];
    }
}

export interface ExistingCsvRows {
    readonly seasons: readonly Record<string, string>[];
    readonly grades: readonly Record<string, string>[];
    readonly teams: readonly Record<string, string>[];
    readonly results: readonly Record<string, string>[];
}

/**
 * The rows a PlayHQ CSV dump must carry over untouched.
 *
 * Fetch no longer writes entity CSVs — D1 is the store — but the archive
 * merge helpers and their tests still use this. A PlayHQ-only dump would
 * otherwise drop 2000-2016 archive rows that no re-run can restore.
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
function gameKeyOf(row: Record<string, CsvValue>): string {
    return `${String(row.grade_key)}|${String(row.round ?? 0).padStart(4, '0')}|${String(row.playhq_id ?? '')}`;
}

/**
 * Overlay fetched fixtures onto an existing year file.
 * Grades this run collected replace their old rows. Every other grade stays.
 * A `--org` / `--competition` / `--grade` walk must not wipe AMND/PL games.
 */
export function mergeYearGames(
    existing: readonly Record<string, CsvValue>[],
    fetched: readonly GameRow[],
): Record<string, CsvValue>[] {
    const fetchedGradeKeys = new Set<string>();
    for (const row of fetched) {
        fetchedGradeKeys.add(row.grade_key);
    }
    const kept: Record<string, CsvValue>[] = [];
    for (const row of existing) {
        if (!fetchedGradeKeys.has(String(row.grade_key))) {
            kept.push(row);
        }
    }
    return [...fetched, ...kept].toSorted((a, b) =>
        gameKeyOf(a).localeCompare(gameKeyOf(b)),
    );
}

function clubFromCsv(row: Record<string, string>): ClubRow {
    return {
        club_key: row.club_key,
        established_year:
            row.established_year === '' ? null : row.established_year,
        home_venue: row.home_venue === '' ? null : row.home_venue,
        name: row.name,
        playhq_id: row.playhq_id === '' ? null : row.playhq_id,
    };
}

function aliasFromCsv(row: Record<string, string>): ClubAliasRow {
    return {
        alias_text: row.alias_text,
        club_key: row.club_key,
        source: row.source,
    };
}

/**
 * Curated git CSVs win on `club_key` / `alias_text`. D1-only rows (minted
 * by a previous Worker import) are kept so the next CLI fetch does not
 * invent a second slug for the same PlayHQ organisation.
 */
export function mergeClubIdentity(
    curated: ClubRegistry,
    fromDb: ClubRegistry,
): ClubRegistry {
    const clubs = new Map(
        fromDb.getClubs().map((club) => [club.club_key, club]),
    );
    for (const club of curated.getClubs()) {
        clubs.set(club.club_key, club);
    }
    const aliases = new Map(
        fromDb.getAliases().map((alias) => [alias.alias_text, alias]),
    );
    for (const alias of curated.getAliases()) {
        aliases.set(alias.alias_text, alias);
    }
    return new ClubRegistry([...clubs.values()], [...aliases.values()]);
}

/** Loads curated `clubs.csv` / `club_aliases.csv` into a fresh registry. */
async function loadCuratedClubRegistry(dataDir: string): Promise<ClubRegistry> {
    const [clubRows, aliasRows] = await Promise.all([
        readExistingCsv<Record<string, string>>(dataDir, 'clubs.csv'),
        readExistingCsv<Record<string, string>>(dataDir, 'club_aliases.csv'),
    ]);
    return new ClubRegistry(
        clubRows.map(clubFromCsv),
        aliasRows.map(aliasFromCsv),
    );
}

async function loadMergedClubRegistry(
    dataDir: string,
    executor: ImportExecutor,
): Promise<ClubRegistry> {
    const [curated, fromDb] = await Promise.all([
        loadCuratedClubRegistry(dataDir),
        clubRegistryFromExecutor(executor.queryAll),
    ]);
    return mergeClubIdentity(curated, fromDb);
}

/** Writes only curated club identity — never seasons/grades/results/games. */
async function writeCuratedClubs(
    dataDir: string,
    clubRegistry: ClubRegistry,
): Promise<void> {
    await writeFile(
        resolve(dataDir, 'clubs.csv'),
        toCsv(clubRegistry.getClubs(), CLUB_COLUMNS),
        'utf-8',
    );
    await writeFile(
        resolve(dataDir, 'club_aliases.csv'),
        toCsv(clubRegistry.getAliases(), ALIAS_COLUMNS),
        'utf-8',
    );
}

export async function runFetch(
    options: FetchOptions,
): Promise<FetchToD1Report> {
    const dataDir = options.dataDir ?? DATA_DIR;
    const rawDir = options.rawDir ?? RAW_DIR;
    await mkdir(rawDir, { recursive: true });
    const store = createFsStore(rawDir);

    const [isFinalBySeasonKey, clubRegistry] = await Promise.all([
        loadIsFinalMap(options.executor),
        loadMergedClubRegistry(dataDir, options.executor),
    ]);

    const collect = options.collect ?? collectPlayHqData;
    const collected = await collect({
        cacheFirst: !options.refresh,
        clubRegistry,
        games: options.games,
        gradeId: options.gradeId,
        isFinalBySeasonKey,
        orgIds: options.orgIds,
        store,
        years: options.years,
    });

    const imported = await runImportData(
        collected.importData,
        options.executor,
        'subset',
    );
    await writeCuratedClubs(dataDir, clubRegistry);

    return {
        games: collected.report.games,
        grades: collected.report.grades,
        imported,
        results: collected.report.results,
        seasons: collected.report.seasons,
        skippedGrades: collected.report.skippedGrades,
        teams: collected.report.teams,
    };
}
