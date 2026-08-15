/**
 * Stage 1 collect: PlayHQ -> normalised rows, with no filesystem access.
 *
 * Deliberately free of `node:fs`, `node:path` and `import.meta.dirname` so it
 * can be imported inside workerd (the scheduled import Workflow) as well as
 * from the Node CLI. The CSV reading/writing half lives in `run.ts`, which is
 * Node-only and must never be pulled into the Worker module graph.
 */
import type { CsvValue } from '@/pipeline/csv';
import type { CaptureStore } from '@/pipeline/fetch/capture-store';
import type { ClubRegistry } from '@/pipeline/fetch/club-registry';
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

const AMND_ORG_ID = '7a5f35e1';
const NETBALL_SA_ORG_ID = '6fefc037';

// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
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

// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
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

// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
export type TeamRow = {
    club_key: string;
    grade_key: string;
    display_name: string;
    squad_number: number | null;
    playhq_id: string;
};

export interface FetchReport {
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
}

export interface CollectOptions {
    store: CaptureStore;
    cacheFirst: boolean;
    clubRegistry: ClubRegistry;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
    games?: boolean;
    years?: readonly number[];
    gradeId?: string;
}

export interface CollectedPlayHq {
    importData: ImportData;
    report: FetchReport;
    /** Snake-case rows for the CLI CSV writer (preserves season `status`). */
    seasons: readonly SeasonRow[];
    grades: readonly GradeRow[];
    teams: readonly TeamRow[];
    results: readonly Record<string, CsvValue>[];
    gamesByYear: ReadonlyMap<number, readonly GameRow[]>;
}

function parseStartYear(dateIso: string): number {
    const year = Number(dateIso.slice(0, 4));
    if (Number.isNaN(year)) {
        throw new TypeError(`parseStartYear: unparsable date "${dateIso}"`);
    }
    return year;
}

interface SeasonEntry {
    id: string;
    name: string;
    startDate: string;
    status: { name: string; value: string };
}

/** Resolves every (competition entry, season) pair PlayHQ lists for an org. */
async function discoverSeasons(
    store: CaptureStore,
    orgId: string,
    cacheFirst: boolean,
): Promise<{ competitionName: string; season: SeasonEntry }[]> {
    const key = `discoverCompetitions_${orgId}.json`;
    // SAFETY: `cachedGraphQL` returns PlayHQ's response envelope unparsed by
    // design (see the ingestion-boundary note in `playhq-client.ts`). Only
    // `data.discoverCompetitions` is read, and every field taken off it is
    // either passed straight through or re-validated downstream.
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
    if (orgId === AMND_ORG_ID) {
        return 'amnd';
    }
    const normalised = gradeName.trim().toUpperCase();
    if (normalised === 'PREMIER DIVISION') {
        return 'premier_league';
    }
    if (normalised === 'RESERVES DIVISION') {
        return 'premier_league_reserves';
    }
    return null;
}

/**
 * Reports (rather than silently dropping) a grade whose org/season is in
 * scope but whose competition isn't catalogued, e.g. "Walking Netball 50+"
 * under the Netball SA Premier League season. Kept out of `collectPlayHqData`
 * to stay under the function-length lint budget.
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
        if (!teamRows.has(key)) {
            teamRows.set(key, row);
        }
    }
}

export interface GradeContext {
    orgId: string;
    period: 'winter' | 'annual';
    startYear: number;
    seasonName: string;
    seasonPlayhqId: string;
    seasonStatus: string;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
}

interface ProcessedGrade {
    seasonKey: string;
    seasonRow: SeasonRow;
    gradeRow: GradeRow;
    results: Record<string, CsvValue>[];
    teams: { key: string; row: TeamRow }[];
}

function registerTeam(
    teams: Map<string, TeamRow>,
    gradeKey: string,
    clubKey: string,
    standing: Standing,
    squadNumber: number | null,
): void {
    const teamKey = `${gradeKey}|${standing.team.id}`;
    if (teams.has(teamKey)) {
        return;
    }
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
    if (competitionKey === null) {
        return null;
    }
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

/**
 * Whether a season is worth a `gradeListDiscoverSeason` request at all.
 *
 * `years === undefined` is the scheduled-import case: only PlayHQ's *active*
 * seasons can have changed, so a completed season is skipped before it costs
 * a request per season plus one per grade. An explicit year list (including
 * the CLI's "all years" empty list) means the caller asked for those seasons
 * by name, so status is not consulted — that is how a finished season gets
 * backfilled or re-scraped.
 */
export function seasonWanted(
    season: { startDate: string; status: { value: string } },
    years: readonly number[] | undefined,
): boolean {
    if (years === undefined) {
        return season.status.value.toLowerCase() === 'active';
    }
    return yearWanted(years, parseStartYear(season.startDate));
}

function wantsGames(
    options: Pick<CollectOptions, 'games' | 'years' | 'gradeId'>,
    startYear: number,
    gradePlayhqId: string,
): boolean {
    if (options.games !== true) {
        return false;
    }
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
    // SAFETY: PlayHQ's own response envelope, returned unparsed by
    // `cachedGraphQL`. The single field read, `data.discoverGradeFixture`, is
    // null-checked on the next line before any use.
    const response = (await cachedGraphQL(
        store,
        key,
        'gradeAllRounds',
        { gradeID: gradePlayhqId },
        cacheFirst,
    )) as GradeAllRoundsResponse;
    const rounds = response.data.discoverGradeFixture;
    if (rounds === null) {
        return [];
    }
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
    if (!wantsGames(options, grade.startYear, grade.gradePlayhqId)) {
        return;
    }
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

interface CollectJob {
    orgId: string;
    period: 'winter' | 'annual';
    minYear: number;
}

const COLLECT_JOBS: readonly CollectJob[] = [
    { orgId: AMND_ORG_ID, period: 'winter', minYear: 2022 },
    { orgId: NETBALL_SA_ORG_ID, period: 'annual', minYear: 2023 },
];

interface CollectAccumulator {
    seasonRows: Map<string, SeasonRow>;
    gradeRows: GradeRow[];
    teamRows: Map<string, TeamRow>;
    resultRows: Record<string, CsvValue>[];
    gamesByYear: Map<number, readonly GameRow[]>;
    skippedGrades: FetchReport['skippedGrades'];
}

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
    // SAFETY: PlayHQ's own response envelope, returned unparsed by
    // `cachedGraphQL`. `data.discoverGrade` is null-checked below before the
    // ladder is flattened, and an absent capture timestamp throws.
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

    const { discoverGrade } = gradeResponse.data;
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
    if (processed === null) {
        return;
    }
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

/**
 * Walks one season's grades. Split out of `collectPlayHqData` so the season
 * skip conditions read as early returns rather than a pile of `continue`s.
 */
async function ingestSeason(
    options: CollectOptions,
    job: CollectJob,
    season: SeasonEntry,
    acc: CollectAccumulator,
): Promise<void> {
    const startYear = parseStartYear(season.startDate);
    if (startYear < job.minYear || !seasonWanted(season, options.years)) {
        return;
    }

    const seasonCaptureKey = `gradeListDiscoverSeason_${season.id}.json`;
    // SAFETY: the `gradeListDiscoverSeason` operation's response envelope is
    // PlayHQ's, not ours — `cachedGraphQL` returns it unparsed by design (see
    // the ingestion-boundary note in `playhq-client.ts`). The one field read
    // below, `data.discoverSeason`, is null-checked immediately.
    const seasonResponse = (await cachedGraphQL(
        options.store,
        seasonCaptureKey,
        'gradeListDiscoverSeason',
        { id: season.id },
        options.cacheFirst,
    )) as GradeListDiscoverSeasonResponse;

    const { discoverSeason } = seasonResponse.data;
    if (discoverSeason === null) {
        console.warn(
            `discoverSeason returned null for season ${season.id} (${season.name}), skipping`,
        );
        return;
    }

    for (const grade of discoverSeason.grades) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        await ingestGrade(options, job, season, startYear, grade, acc);
    }
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
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        const entries = await discoverSeasons(
            options.store,
            job.orgId,
            options.cacheFirst,
        );
        for (const { season } of entries) {
            // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
            await ingestSeason(options, job, season, acc);
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
