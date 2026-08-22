/**
 * Stage 1 collect: PlayHQ -> normalised rows, with no filesystem access.
 *
 * Deliberately free of `node:fs`, `node:path` and `import.meta.dirname` so it
 * can be imported inside workerd (the scheduled import Workflow) as well as
 * from the Node CLI. The CSV reading/writing half lives in `run.ts`, which is
 * Node-only and must never be pulled into the Worker module graph.
 */
import { isNull, isUndefined } from 'es-toolkit';
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

export const AMND_ORG_ID = '7a5f35e1';
export const NETBALL_SA_ORG_ID = '6fefc037';
export const SAUCNA_ORG_ID = 'fb89f1f1';
export const SUNA_ORG_ID = '4bd9b8ae';
export const ELIZABETH_ORG_ID = '7ffb0e67';
export const CITY_NIGHT_ORG_ID = '2276ec85';
export const SAMMNA_ORG_ID = '7936878d';

export type CollectPeriod = 'winter' | 'summer' | 'annual';

interface AssociationOrg {
    key: string;
    playHqCompetitionName: string;
    /** When winter and summer share one PlayHQ competition object. */
    seasonNameIncludes?: string;
}

/**
 * 1:1 PlayHQ org → catalogue key. Names are the PlayHQ competition objects
 * `discoverCompetitions` returned on 2026-08-22, not invented slugs.
 */
const ASSOCIATION_BY_ORG = new Map<string, AssociationOrg>([
    [SAUCNA_ORG_ID, { key: 'saucna', playHqCompetitionName: 'SAUCNA Winter' }],
    [SUNA_ORG_ID, { key: 'suna', playHqCompetitionName: 'SUNA Winter' }],
    [
        ELIZABETH_ORG_ID,
        {
            key: 'elizabeth',
            playHqCompetitionName: 'Elizabeth Netball Association',
            seasonNameIncludes: 'Winter',
        },
    ],
    [
        CITY_NIGHT_ORG_ID,
        {
            key: 'city_night_division',
            playHqCompetitionName: 'City Night Division 1',
            seasonNameIncludes: 'Summer',
        },
    ],
    [
        SAMMNA_ORG_ID,
        {
            key: 'sammna',
            playHqCompetitionName: 'M League',
            seasonNameIncludes: 'Winter',
        },
    ],
]);

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
    /**
     * PlayHQ organisation IDs to walk. Omitted means every `COLLECT_JOBS`
     * org. Pass one id to target a single association.
     */
    orgIds?: readonly string[];
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
 * True when this PlayHQ competition object is one we fetch for the org.
 * Association orgs also list carnivals, schools and summer; those stay out
 * of scope until they have their own catalogue keys.
 */
export function isCataloguedPlayHqCompetition(
    orgId: string,
    playHqCompetitionName: string,
): boolean {
    const association = ASSOCIATION_BY_ORG.get(orgId);
    if (isUndefined(association)) {
        return true;
    }
    return playHqCompetitionName === association.playHqCompetitionName;
}

/**
 * Elizabeth and SAMMNA put winter and summer on one competition object.
 * City Night's 2023+ home-and-away is summer. Skip the other period.
 */
export function associationSeasonWanted(
    orgId: string,
    seasonName: string,
): boolean {
    const association = ASSOCIATION_BY_ORG.get(orgId);
    if (isUndefined(association) || isUndefined(association.seasonNameIncludes)) {
        return true;
    }
    return seasonName
        .toLowerCase()
        .includes(association.seasonNameIncludes.toLowerCase());
}

/**
 * competitionKey for a grade name under a given org. `null` means "in scope
 * for the org's season, but not a competition this task fetches" — e.g. the
 * Netball SA Premier League season also lists "Walking Netball 50+", which
 * is out of scope (not a catalogued competition) and is skipped rather than
 * failing the whole run.
 *
 * Association orgs are 1:1 like AMND, but only for the winter home-and-away
 * PlayHQ competition. Carnival / summer names resolve to null.
 */
export function resolveCompetitionKey(
    orgId: string,
    gradeName: string,
    playHqCompetitionName?: string,
): string | null {
    if (orgId === AMND_ORG_ID) {
        return 'amnd';
    }
    const association = ASSOCIATION_BY_ORG.get(orgId);
    if (!isUndefined(association)) {
        if (playHqCompetitionName === association.playHqCompetitionName) {
            return association.key;
        }
        return null;
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
        gradeName,
        reason: 'out_of_scope',
        seasonKey: seasonId,
        teamCount: -1,
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
    period: CollectPeriod;
    startYear: number;
    seasonName: string;
    seasonPlayhqId: string;
    seasonStatus: string;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
    playHqCompetitionName?: string;
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
        display_name: standing.team.name,
        grade_key: gradeKey,
        playhq_id: standing.team.id,
        squad_number: squadNumber,
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
    const competitionKey = resolveCompetitionKey(
        ctx.orgId,
        grade.name,
        ctx.playHqCompetitionName,
    );
    if (isNull(competitionKey)) {
        return null;
    }
    const seasonKey = buildSeasonKey(competitionKey, ctx.period, ctx.startYear);
    const gradeKey = buildGradeKey(seasonKey, grade.name);

    const { tier, division } = parseGradeName(grade.name, competitionKey);
    const gradeRow: GradeRow = {
        age_band: grade.age?.name ?? null,
        division,
        grade_key: gradeKey,
        name: grade.name,
        playhq_id: grade.id,
        season_key: seasonKey,
        team_count: standings.length,
        tier,
    };

    const seasonRow: SeasonRow = {
        competition_key: competitionKey,
        competition_period: ctx.period,
        end_year: ctx.startYear,
        is_final: Number(ctx.isFinalBySeasonKey.get(seasonKey) ?? 0),
        label: ctx.seasonName,
        playhq_id: ctx.seasonPlayhqId,
        season_key: seasonKey,
        source: 'playhq',
        start_year: ctx.startYear,
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
        gradeRow,
        results,
        seasonKey,
        seasonRow,
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
        isUndefined(years) || years.length === 0 || years.includes(startYear)
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
    if (isUndefined(years)) {
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
    if (!isUndefined(options.gradeId) && options.gradeId !== gradePlayhqId) {
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
    if (isNull(rounds)) {
        return [];
    }
    // As with ladders, scraped_at is when the capture was fetched, so a
    // cache-only re-run reproduces a byte-identical CSV.
    const scrapedAt = await store.capturedAtMs(key);
    if (isUndefined(scrapedAt)) {
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
    period: CollectPeriod;
    minYear: number;
}

const COLLECT_JOBS: readonly CollectJob[] = [
    { minYear: 2022, orgId: AMND_ORG_ID, period: 'winter' },
    { minYear: 2023, orgId: NETBALL_SA_ORG_ID, period: 'annual' },
    { minYear: 2023, orgId: SAUCNA_ORG_ID, period: 'winter' },
    { minYear: 2023, orgId: SUNA_ORG_ID, period: 'winter' },
    { minYear: 2023, orgId: ELIZABETH_ORG_ID, period: 'winter' },
    { minYear: 2023, orgId: CITY_NIGHT_ORG_ID, period: 'summer' },
    { minYear: 2023, orgId: SAMMNA_ORG_ID, period: 'winter' },
];

/**
 * The hardcoded collect walk. Pass `orgIds` to target one org (the CLI
 * `--org` / `--competition` flags) without changing `COLLECT_JOBS`.
 */
export function collectJobsFor(
    orgIds?: readonly string[],
): readonly CollectJob[] {
    if (isUndefined(orgIds) || orgIds.length === 0) {
        return COLLECT_JOBS;
    }
    const wanted = new Set(orgIds);
    const jobs = COLLECT_JOBS.filter((job) => wanted.has(job.orgId));
    for (const orgId of wanted) {
        if (!COLLECT_JOBS.some((job) => job.orgId === orgId)) {
            throw new Error(
                `unknown PlayHQ org id "${orgId}" — not in COLLECT_JOBS`,
            );
        }
    }
    return jobs;
}

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
    playHqCompetitionName: string,
): Promise<void> {
    const competitionKey = resolveCompetitionKey(
        job.orgId,
        grade.name,
        playHqCompetitionName,
    );
    // Out of scope, e.g. "Walking Netball 50+" under the Premier League season.
    // Reported (not just dropped) so a grade that genuinely comes into
    // scope later under a catalogued org doesn't silently vanish.
    if (isNull(competitionKey)) {
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
    if (isUndefined(scrapedAt)) {
        throw new Error(`missing capturedAtMs for ${gradeCaptureKey}`);
    }

    const { discoverGrade } = gradeResponse.data;
    const standings: readonly Standing[] = isNull(discoverGrade)
        ? []
        : flattenStandings(discoverGrade.ladder);

    const seasonKeyPreview = buildSeasonKey(
        competitionKey,
        job.period,
        startYear,
    );
    if (standings.length < 2) {
        acc.skippedGrades.push({
            gradeName: grade.name,
            reason: 'too_few_teams',
            seasonKey: seasonKeyPreview,
            teamCount: standings.length,
        });
        return;
    }

    const processed = processGrade(
        grade,
        standings,
        {
            isFinalBySeasonKey: options.isFinalBySeasonKey,
            orgId: job.orgId,
            period: job.period,
            playHqCompetitionName,
            seasonName: season.name,
            seasonPlayhqId: season.id,
            seasonStatus: season.status.value.toLowerCase(),
            startYear,
        },
        options.clubRegistry,
        scrapedAt,
    );
    // Unreachable: already filtered above. Kept for type safety.
    if (isNull(processed)) {
        return;
    }
    if (!acc.seasonRows.has(processed.seasonKey)) {
        acc.seasonRows.set(processed.seasonKey, processed.seasonRow);
    }
    acc.gradeRows.push(processed.gradeRow);
    acc.resultRows.push(...processed.results);
    mergeTeams(acc.teamRows, processed.teams);

    await collectGames(options.store, acc.gamesByYear, options, {
        gradeKey: processed.gradeRow.grade_key,
        gradePlayhqId: grade.id,
        startYear,
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
    playHqCompetitionName: string,
): Promise<void> {
    const startYear = parseStartYear(season.startDate);
    if (startYear < job.minYear || !seasonWanted(season, options.years)) {
        return;
    }
    if (!associationSeasonWanted(job.orgId, season.name)) {
        console.warn(
            `out-of-scope PlayHQ season skipped: "${season.name}" (competition ${playHqCompetitionName}, org ${job.orgId})`,
        );
        return;
    }
    if (!isCataloguedPlayHqCompetition(job.orgId, playHqCompetitionName)) {
        console.warn(
            `out-of-scope PlayHQ competition skipped: "${playHqCompetitionName}" (season ${season.name}, org ${job.orgId})`,
        );
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
    if (isNull(discoverSeason)) {
        console.warn(
            `discoverSeason returned null for season ${season.id} (${season.name}), skipping`,
        );
        return;
    }

    for (const grade of discoverSeason.grades) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        await ingestGrade(
            options,
            job,
            season,
            startYear,
            grade,
            acc,
            playHqCompetitionName,
        );
    }
}

export async function collectPlayHqData(
    options: CollectOptions,
): Promise<CollectedPlayHq> {
    const acc: CollectAccumulator = {
        gamesByYear: new Map(),
        gradeRows: [],
        resultRows: [],
        seasonRows: new Map(),
        skippedGrades: [],
        teamRows: new Map(),
    };

    for (const job of collectJobsFor(options.orgIds)) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        const entries = await discoverSeasons(
            options.store,
            job.orgId,
            options.cacheFirst,
        );
        for (const { competitionName, season } of entries) {
            // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
            await ingestSeason(options, job, season, acc, competitionName);
        }
    }

    const seasons = [...acc.seasonRows.values()];
    const teams = [...acc.teamRows.values()];
    const games = [...acc.gamesByYear.values()].flat();
    return {
        gamesByYear: acc.gamesByYear,
        grades: acc.gradeRows,
        importData: toImportData({
            aliases: options.clubRegistry.getAliases(),
            clubs: options.clubRegistry.getClubs(),
            games,
            grades: acc.gradeRows,
            results: acc.resultRows,
            seasons,
            teams,
        }),
        report: {
            games: games.length,
            grades: acc.gradeRows.length,
            results: acc.resultRows.length,
            seasons: seasons.length,
            skippedGrades: acc.skippedGrades,
            teams: teams.length,
        },
        results: acc.resultRows,
        seasons,
        teams,
    };
}
