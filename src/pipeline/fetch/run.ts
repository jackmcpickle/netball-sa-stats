/**
 * Orchestrates stage 1 of the pipeline: PlayHQ -> normalised CSVs under
 * `data/`. Thin CLI wrapper lives in `scripts/fetch-playhq.ts`; this module
 * holds the actual logic so it can be tested (the pure pieces, at least)
 * without a workerd runtime.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCsv, toCsv } from '@/pipeline/csv';
import type { CsvValue } from '@/pipeline/csv';
import { createFsStore } from '@/pipeline/fetch/capture-store';
import type { CaptureStore } from '@/pipeline/fetch/capture-store';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import { toGameRows } from '@/pipeline/fetch/games';
import type { GameRow } from '@/pipeline/fetch/games';
import { parseGradeName } from '@/pipeline/fetch/grade-name';
import {
    buildGradeKey,
    buildSeasonKey,
    extractSquadNumber,
} from '@/pipeline/fetch/keys';
import {
    flattenStandings,
    mapStandingsToResults,
} from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';
import { cachedGraphQL } from '@/pipeline/fetch/playhq-client';
import { toImportData } from '@/pipeline/fetch/to-import';
import type {
    DiscoverCompetitionsResponse,
    GradeAllRoundsResponse,
    GradeLadderResponse,
    GradeListDiscoverSeasonResponse,
} from '@/pipeline/fetch/types';
import type { ImportData } from '@/pipeline/import/types';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DATA_DIR = resolve(ROOT, 'data');
const RAW_DIR = resolve(DATA_DIR, 'raw');

const AMND_ORG_ID = '7a5f35e1';
const NETBALL_SA_ORG_ID = '6fefc037';

export type SeasonRow = {
    competition_key: string;
    season_key: string;
    competition_period: 'winter' | 'summer' | 'annual';
    label: string;
    start_year: number;
    end_year: number;
    is_final: number;
    playhq_id: string;
    source: 'playhq';
    status: string;
};

export type GradeRow = {
    season_key: string;
    grade_key: string;
    name: string;
    tier: number;
    division: number | null;
    team_count: number;
    age_band: string | null;
    playhq_id: string;
};

export type TeamRow = {
    club_key: string;
    grade_key: string;
    display_name: string;
    squad_number: number | null;
    playhq_id: string;
};

export type FetchOptions = {
    refresh: boolean;
    /** Also fetch fixtures and write `data/games-<year>.csv`. */
    games?: boolean;
    /** Restrict collect to these season start years (ladders and games). Empty means all. */
    years?: readonly number[];
    /** Restrict the games fetch to a single PlayHQ grade id, for spot checks. */
    gradeId?: string;
};

export type FetchReport = {
    seasons: number;
    grades: number;
    teams: number;
    results: number;
    games: number;
    skippedGrades: {
        seasonKey: string;
        gradeName: string;
        teamCount: number;
        reason: 'too_few_teams' | 'out_of_scope';
    }[];
};

export type CollectOptions = {
    store: CaptureStore;
    cacheFirst: boolean;
    clubRegistry: ClubRegistry;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
    games?: boolean;
    years?: readonly number[];
    gradeId?: string;
};

export type CollectedPlayHq = {
    importData: ImportData;
    report: FetchReport;
    /** Snake-case rows for the CLI CSV writer (preserves season `status`). */
    seasons: readonly SeasonRow[];
    grades: readonly GradeRow[];
    teams: readonly TeamRow[];
    results: readonly Record<string, CsvValue>[];
    gamesByYear: ReadonlyMap<number, readonly GameRow[]>;
};

async function readExistingCsv<T extends Record<string, string>>(
    fileName: string,
): Promise<T[]> {
    try {
        const text = await readFile(resolve(DATA_DIR, fileName), 'utf8');
        return parseCsv(text) as T[];
    } catch {
        return [];
    }
}

function parseStartYear(dateIso: string): number {
    const year = Number(dateIso.slice(0, 4));
    if (Number.isNaN(year)) {
        throw new Error(`parseStartYear: unparsable date "${dateIso}"`);
    }
    return year;
}

type SeasonEntry = {
    id: string;
    name: string;
    startDate: string;
    status: { name: string; value: string };
};

/** Resolves every (competition entry, season) pair PlayHQ lists for an org. */
async function discoverSeasons(
    store: CaptureStore,
    orgId: string,
    cacheFirst: boolean,
): Promise<{ competitionName: string; season: SeasonEntry }[]> {
    const key = `discoverCompetitions_${orgId}.json`;
    const response = (await cachedGraphQL(
        store,
        key,
        'discoverCompetitions',
        { organisationID: orgId },
        cacheFirst,
    )) as DiscoverCompetitionsResponse;

    return response.data.discoverCompetitions.flatMap((competition) =>
        competition.seasons.map((season) => ({
            competitionName: competition.name,
            season,
        })),
    );
}

/**
 * competitionKey for a grade name under a given org. `null` means "in scope
 * for the org's season, but not a competition this task fetches" — e.g. the
 * Netball SA Premier League season also lists "Walking Netball 50+", which
 * is out of scope (not one of the six catalogued competitions) and is
 * skipped rather than failing the whole run.
 */
export function resolveCompetitionKey(
    orgId: string,
    gradeName: string,
): string | null {
    if (orgId === AMND_ORG_ID) return 'amnd';
    const normalised = gradeName.trim().toUpperCase();
    if (normalised === 'PREMIER DIVISION') return 'premier_league';
    if (normalised === 'RESERVES DIVISION') return 'premier_league_reserves';
    return null;
}

/**
 * Reports (rather than silently dropping) a grade whose org/season is in
 * scope but whose competition isn't catalogued, e.g. "Walking Netball 50+"
 * under the Netball SA Premier League season. Kept out of `runFetch` to stay
 * under the function-length lint budget.
 */
function recordOutOfScopeGrade(
    skippedGrades: FetchReport['skippedGrades'],
    orgId: string,
    seasonId: string,
    seasonName: string,
    gradeName: string,
): void {
    console.warn(
        `out-of-scope grade skipped: "${gradeName}" (season ${seasonName}, org ${orgId})`,
    );
    skippedGrades.push({
        seasonKey: seasonId,
        gradeName,
        teamCount: -1,
        reason: 'out_of_scope',
    });
}

function mergeTeams(
    teamRows: Map<string, TeamRow>,
    teams: readonly { key: string; row: TeamRow }[],
): void {
    for (const { key, row } of teams) {
        if (!teamRows.has(key)) teamRows.set(key, row);
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

export type GradeContext = {
    orgId: string;
    period: 'winter' | 'annual';
    startYear: number;
    seasonName: string;
    seasonPlayhqId: string;
    seasonStatus: string;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
};

type ProcessedGrade = {
    seasonKey: string;
    seasonRow: SeasonRow;
    gradeRow: GradeRow;
    results: Record<string, CsvValue>[];
    teams: { key: string; row: TeamRow }[];
};

function registerTeam(
    teams: Map<string, TeamRow>,
    gradeKey: string,
    clubKey: string,
    standing: Standing,
    squadNumber: number | null,
): void {
    const teamKey = `${gradeKey}|${standing.team.id}`;
    if (teams.has(teamKey)) return;
    teams.set(teamKey, {
        club_key: clubKey,
        grade_key: gradeKey,
        display_name: standing.team.name,
        squad_number: squadNumber,
        playhq_id: standing.team.id,
    });
}

/**
 * Resolves the *display* squad number for every standing. This is purely
 * informational — team identity is `playhq_id` (see `registerTeam`), never
 * derived from this value or from position within a collision group. So a
 * colour-named/unnumbered team (e.g. "City Coasters Purple") always stays
 * `null` here, even when it shares a club+grade with another unnumbered
 * team: there is no fabricated, index-dependent number to look meaningfully
 * like a real one. Only a genuine numeric suffix ("Walkerville 1"/"2")
 * produces a value.
 */
function resolveSquadNumbers(
    clubStandings: readonly Standing[],
): Map<Standing, number | null> {
    const resolved = new Map<Standing, number | null>();
    for (const standing of clubStandings) {
        resolved.set(standing, extractSquadNumber(standing.team.name));
    }
    return resolved;
}

export function processGrade(
    grade: {
        id: string;
        name: string;
        age: { name: string } | null;
    },
    standings: readonly Standing[],
    ctx: GradeContext,
    clubRegistry: ClubRegistry,
    scrapedAt: number,
): ProcessedGrade | null {
    const competitionKey = resolveCompetitionKey(ctx.orgId, grade.name);
    if (competitionKey === null) return null;
    const seasonKey = buildSeasonKey(competitionKey, ctx.period, ctx.startYear);
    const gradeKey = buildGradeKey(seasonKey, grade.name);

    const { tier, division } = parseGradeName(grade.name);
    const gradeRow: GradeRow = {
        season_key: seasonKey,
        grade_key: gradeKey,
        name: grade.name,
        tier,
        division,
        team_count: standings.length,
        age_band: grade.age?.name ?? null,
        playhq_id: grade.id,
    };

    const seasonRow: SeasonRow = {
        competition_key: competitionKey,
        season_key: seasonKey,
        competition_period: ctx.period,
        label: ctx.seasonName,
        start_year: ctx.startYear,
        end_year: ctx.startYear,
        is_final: Number(ctx.isFinalBySeasonKey.get(seasonKey) ?? 0),
        playhq_id: ctx.seasonPlayhqId,
        source: 'playhq',
        status: ctx.seasonStatus,
    };

    // Resolve every standing's squad number once, grouped by club, so
    // `teams.csv` and `team_season_results.csv` always agree - including the
    // synthetic disambiguator assigned when two teams collide on the parsed
    // value (see `resolveSquadNumbers`).
    const standingsByClub = new Map<string, Standing[]>();
    for (const standing of standings) {
        const clubKey = clubRegistry.resolve(
            standing.team.organisation.id,
            standing.team.organisation.name,
        );
        const group = standingsByClub.get(clubKey) ?? [];
        group.push(standing);
        standingsByClub.set(clubKey, group);
    }
    const squadNumberByStanding = new Map<Standing, number | null>();
    for (const [, clubStandings] of standingsByClub) {
        const squadNumbers = resolveSquadNumbers(clubStandings);
        for (const standing of clubStandings) {
            squadNumberByStanding.set(
                standing,
                squadNumbers.get(standing) ?? null,
            );
        }
    }

    const results = mapStandingsToResults(
        gradeKey,
        standings,
        (organisationId, organisationName) =>
            clubRegistry.resolve(organisationId, organisationName),
        scrapedAt,
        (standing) => squadNumberByStanding.get(standing) ?? null,
    );

    const teams = new Map<string, TeamRow>();
    for (const [clubKey, clubStandings] of standingsByClub) {
        for (const standing of clubStandings) {
            registerTeam(
                teams,
                gradeKey,
                clubKey,
                standing,
                squadNumberByStanding.get(standing) ?? null,
            );
        }
    }

    return {
        seasonKey,
        seasonRow,
        gradeRow,
        results,
        teams: [...teams.entries()].map(([key, row]) => ({ key, row })),
    };
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
 * `grades.csv` and `teams.csv` have no `source` column, so archive-ness is
 * inherited: season -> grade -> team.
 */
export function archiveRowsToKeep(existing: ExistingCsvRows): ExistingCsvRows {
    const seasons = existing.seasons.filter((row) => row.source !== 'playhq');
    const seasonKeys = new Set(seasons.map((row) => row.season_key));
    const grades = existing.grades.filter((row) =>
        seasonKeys.has(row.season_key),
    );
    const gradeKeys = new Set(grades.map((row) => row.grade_key));
    return {
        seasons,
        grades,
        teams: existing.teams.filter((row) => gradeKeys.has(row.grade_key)),
        results: existing.results.filter((row) => row.source !== 'playhq'),
    };
}

/**
 * Whether this grade's fixtures are wanted on this run. Year and grade
 * filters exist so 2025 and 2026 can be backfilled separately, and so a
 * single grade can be spot-checked without walking the whole catalogue.
 */
function yearWanted(
    years: readonly number[] | undefined,
    startYear: number,
): boolean {
    return (
        years === undefined || years.length === 0 || years.includes(startYear)
    );
}

function wantsGames(
    options: Pick<CollectOptions, 'games' | 'years' | 'gradeId'>,
    startYear: number,
    gradePlayhqId: string,
): boolean {
    if (options.games !== true) return false;
    if (options.gradeId !== undefined && options.gradeId !== gradePlayhqId) {
        return false;
    }
    return yearWanted(options.years, startYear);
}

/**
 * Fetches one grade's fixtures. Returns `[]` for a grade with no published
 * fixture rather than throwing — a brand-new season lists grades before it
 * lists games.
 */
async function fetchGamesForGrade(
    store: CaptureStore,
    gradePlayhqId: string,
    gradeKey: string,
    cacheFirst: boolean,
): Promise<readonly GameRow[]> {
    const key = `gradeAllRounds_${gradePlayhqId}.json`;
    const response = (await cachedGraphQL(
        store,
        key,
        'gradeAllRounds',
        { gradeID: gradePlayhqId },
        cacheFirst,
    )) as GradeAllRoundsResponse;
    const rounds = response.data.discoverGradeFixture;
    if (rounds === null) return [];
    // As with ladders, scraped_at is when the capture was fetched, so a
    // cache-only re-run reproduces a byte-identical CSV.
    const scrapedAt = await store.capturedAtMs(key);
    if (scrapedAt === undefined) {
        throw new Error(`missing capturedAtMs for ${key}`);
    }
    return toGameRows(rounds, gradeKey, scrapedAt);
}

/**
 * Fetches and accumulates one grade's fixtures, if this run wants them.
 * Called for a grade that has already been accepted into `grades.csv`, so a
 * games row can never reference a grade_key that does not exist.
 */
async function collectGames(
    store: CaptureStore,
    gamesByYear: Map<number, readonly GameRow[]>,
    options: Pick<CollectOptions, 'games' | 'years' | 'gradeId' | 'cacheFirst'>,
    grade: {
        startYear: number;
        gradePlayhqId: string;
        gradeKey: string;
    },
): Promise<void> {
    if (!wantsGames(options, grade.startYear, grade.gradePlayhqId)) return;
    const rows = await fetchGamesForGrade(
        store,
        grade.gradePlayhqId,
        grade.gradeKey,
        options.cacheFirst,
    );
    gamesByYear.set(grade.startYear, [
        ...(gamesByYear.get(grade.startYear) ?? []),
        ...rows,
    ]);
}

/** Sorted so a re-run diffs on real changes rather than row order. */
function gameKeyOf(row: GameRow): string {
    return `${row.grade_key}|${String(row.round ?? 0).padStart(4, '0')}|${row.playhq_id}`;
}

async function writeGamesCsvs(
    gamesByYear: ReadonlyMap<number, readonly GameRow[]>,
): Promise<number> {
    let total = 0;
    for (const [year, rows] of [...gamesByYear].sort((a, b) => a[0] - b[0])) {
        const sorted = [...rows].sort((a, b) =>
            gameKeyOf(a).localeCompare(gameKeyOf(b)),
        );
        // eslint-disable-next-line no-await-in-loop -- a handful of files, written in order for a stable log.
        await writeFile(
            resolve(DATA_DIR, `games-${String(year)}.csv`),
            toCsv(sorted),
            'utf8',
        );
        total += sorted.length;
    }
    return total;
}

type FetchedRows = {
    readonly seasons: readonly SeasonRow[];
    readonly grades: readonly GradeRow[];
    readonly teams: readonly TeamRow[];
    readonly results: readonly Record<string, CsvValue>[];
};

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
    const archived = archiveRowsToKeep({
        seasons: existingSeasons,
        grades: await readExistingCsv('grades.csv'),
        teams: await readExistingCsv('teams.csv'),
        results: await readExistingCsv('team_season_results.csv'),
    });

    const seasons = [...fetched.seasons, ...archived.seasons].sort((a, b) =>
        a.season_key.localeCompare(b.season_key),
    );
    const grades = [...fetched.grades, ...archived.grades].sort((a, b) =>
        a.grade_key.localeCompare(b.grade_key),
    );
    const teams = [...fetched.teams, ...archived.teams].sort((a, b) =>
        teamKeyOf(a).localeCompare(teamKeyOf(b)),
    );
    const results = [...fetched.results, ...archived.results].sort((a, b) =>
        resultKeyOf(a).localeCompare(resultKeyOf(b)),
    );

    await writeFile(resolve(DATA_DIR, 'seasons.csv'), toCsv(seasons), 'utf8');
    await writeFile(
        resolve(DATA_DIR, 'clubs.csv'),
        toCsv(clubRegistry.getClubs()),
        'utf8',
    );
    await writeFile(
        resolve(DATA_DIR, 'club_aliases.csv'),
        toCsv(clubRegistry.getAliases()),
        'utf8',
    );
    await writeFile(resolve(DATA_DIR, 'grades.csv'), toCsv(grades), 'utf8');
    await writeFile(resolve(DATA_DIR, 'teams.csv'), toCsv(teams), 'utf8');
    await writeFile(
        resolve(DATA_DIR, 'team_season_results.csv'),
        toCsv(results),
        'utf8',
    );

    return {
        seasons: seasons.length,
        grades: grades.length,
        teams: teams.length,
        results: results.length,
    };
}

/** Loads the curated `clubs.csv`/`club_aliases.csv` state into a fresh registry. */
async function loadClubRegistry(): Promise<ClubRegistry> {
    const existingClubs = (
        await readExistingCsv<Record<string, string>>('clubs.csv')
    ).map(
        (row): ClubRow => ({
            club_key: row.club_key,
            name: row.name,
            established_year:
                row.established_year === '' ? null : row.established_year,
            home_venue: row.home_venue === '' ? null : row.home_venue,
            playhq_id: row.playhq_id === '' ? null : row.playhq_id,
        }),
    );
    const existingAliases = (
        await readExistingCsv<Record<string, string>>('club_aliases.csv')
    ).map(
        (row): ClubAliasRow => ({
            club_key: row.club_key,
            alias_text: row.alias_text,
            source: row.source,
        }),
    );
    return new ClubRegistry(existingClubs, existingAliases);
}

type CollectJob = {
    orgId: string;
    period: 'winter' | 'annual';
    minYear: number;
};

const COLLECT_JOBS: readonly CollectJob[] = [
    { orgId: AMND_ORG_ID, period: 'winter', minYear: 2022 },
    { orgId: NETBALL_SA_ORG_ID, period: 'annual', minYear: 2023 },
];

type CollectAccumulator = {
    seasonRows: Map<string, SeasonRow>;
    gradeRows: GradeRow[];
    teamRows: Map<string, TeamRow>;
    resultRows: Record<string, CsvValue>[];
    gamesByYear: Map<number, readonly GameRow[]>;
    skippedGrades: FetchReport['skippedGrades'];
};

async function ingestGrade(
    options: CollectOptions,
    job: CollectJob,
    season: SeasonEntry,
    startYear: number,
    grade: {
        id: string;
        name: string;
        age: { name: string } | null;
    },
    acc: CollectAccumulator,
): Promise<void> {
    const competitionKey = resolveCompetitionKey(job.orgId, grade.name);
    // Out of scope, e.g. "Walking Netball 50+" under the Premier League season.
    // Reported (not just dropped) so a grade that genuinely comes into
    // scope later under a catalogued org doesn't silently vanish.
    if (competitionKey === null) {
        recordOutOfScopeGrade(
            acc.skippedGrades,
            job.orgId,
            season.id,
            season.name,
            grade.name,
        );
        return;
    }

    const gradeCaptureKey = `gradeLadder_${grade.id}.json`;
    const gradeResponse = (await cachedGraphQL(
        options.store,
        gradeCaptureKey,
        'gradeLadder',
        { gradeID: grade.id },
        options.cacheFirst,
    )) as GradeLadderResponse;
    // scraped_at is when the capture was fetched, not `Date.now()`
    // — so a cache-only re-run (unchanged upstream) reproduces
    // byte-identical CSVs instead of a fresh timestamp on every row
    // every time.
    const scrapedAt = await options.store.capturedAtMs(gradeCaptureKey);
    if (scrapedAt === undefined) {
        throw new Error(`missing capturedAtMs for ${gradeCaptureKey}`);
    }

    const discoverGrade = gradeResponse.data.discoverGrade;
    const standings: readonly Standing[] =
        discoverGrade === null ? [] : flattenStandings(discoverGrade.ladder);

    const seasonKeyPreview = buildSeasonKey(
        competitionKey,
        job.period,
        startYear,
    );
    if (standings.length < 2) {
        acc.skippedGrades.push({
            seasonKey: seasonKeyPreview,
            gradeName: grade.name,
            teamCount: standings.length,
            reason: 'too_few_teams',
        });
        return;
    }

    const processed = processGrade(
        grade,
        standings,
        {
            orgId: job.orgId,
            period: job.period,
            startYear,
            seasonName: season.name,
            seasonPlayhqId: season.id,
            seasonStatus: season.status.value.toLowerCase(),
            isFinalBySeasonKey: options.isFinalBySeasonKey,
        },
        options.clubRegistry,
        scrapedAt,
    );
    // Unreachable: already filtered above. Kept for type safety.
    if (processed === null) return;
    if (!acc.seasonRows.has(processed.seasonKey)) {
        acc.seasonRows.set(processed.seasonKey, processed.seasonRow);
    }
    acc.gradeRows.push(processed.gradeRow);
    acc.resultRows.push(...processed.results);
    mergeTeams(acc.teamRows, processed.teams);

    await collectGames(options.store, acc.gamesByYear, options, {
        startYear,
        gradePlayhqId: grade.id,
        gradeKey: processed.gradeRow.grade_key,
    });
}

export async function collectPlayHqData(
    options: CollectOptions,
): Promise<CollectedPlayHq> {
    const acc: CollectAccumulator = {
        seasonRows: new Map(),
        gradeRows: [],
        teamRows: new Map(),
        resultRows: [],
        gamesByYear: new Map(),
        skippedGrades: [],
    };

    for (const job of COLLECT_JOBS) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        const entries = await discoverSeasons(
            options.store,
            job.orgId,
            options.cacheFirst,
        );
        for (const { season } of entries) {
            const startYear = parseStartYear(season.startDate);
            if (startYear < job.minYear) continue;
            if (!yearWanted(options.years, startYear)) continue;

            const seasonCaptureKey = `gradeListDiscoverSeason_${season.id}.json`;
            // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
            const seasonResponse = (await cachedGraphQL(
                options.store,
                seasonCaptureKey,
                'gradeListDiscoverSeason',
                { id: season.id },
                options.cacheFirst,
            )) as GradeListDiscoverSeasonResponse;

            const discoverSeason = seasonResponse.data.discoverSeason;
            if (discoverSeason === null) {
                console.warn(
                    `discoverSeason returned null for season ${season.id} (${season.name}), skipping`,
                );
                continue;
            }

            for (const grade of discoverSeason.grades) {
                // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
                await ingestGrade(options, job, season, startYear, grade, acc);
            }
        }
    }

    const seasons = [...acc.seasonRows.values()];
    const teams = [...acc.teamRows.values()];
    const games = [...acc.gamesByYear.values()].flat();
    return {
        importData: toImportData({
            seasons,
            clubs: options.clubRegistry.getClubs(),
            aliases: options.clubRegistry.getAliases(),
            grades: acc.gradeRows,
            teams,
            results: acc.resultRows,
            games,
        }),
        report: {
            seasons: seasons.length,
            grades: acc.gradeRows.length,
            teams: teams.length,
            results: acc.resultRows.length,
            games: games.length,
            skippedGrades: acc.skippedGrades,
        },
        seasons,
        grades: acc.gradeRows,
        teams,
        results: acc.resultRows,
        gamesByYear: acc.gamesByYear,
    };
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
        store,
        cacheFirst: !options.refresh,
        clubRegistry,
        isFinalBySeasonKey,
        games: options.games,
        years: options.years,
        gradeId: options.gradeId,
    });

    const written = await writeCsvs(
        {
            seasons: collected.seasons,
            grades: collected.grades,
            teams: collected.teams,
            results: collected.results,
        },
        existingSeasons,
        clubRegistry,
    );

    const games = await writeGamesCsvs(collected.gamesByYear);

    return { ...written, games, skippedGrades: collected.report.skippedGrades };
}
