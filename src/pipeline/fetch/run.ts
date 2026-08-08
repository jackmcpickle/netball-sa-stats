/**
 * Orchestrates stage 1 of the pipeline: PlayHQ -> normalised CSVs under
 * `data/`. Thin CLI wrapper lives in `scripts/fetch-playhq.ts`; this module
 * holds the actual logic so it can be tested (the pure pieces, at least)
 * without a workerd runtime.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCsv, toCsv } from '@/pipeline/csv';
import type { CsvValue } from '@/pipeline/csv';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
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
import type {
    DiscoverCompetitionsResponse,
    GradeLadderResponse,
    GradeListDiscoverSeasonResponse,
} from '@/pipeline/fetch/types';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DATA_DIR = resolve(ROOT, 'data');
const RAW_DIR = resolve(DATA_DIR, 'raw');

const AMND_ORG_ID = '7a5f35e1';
const NETBALL_SA_ORG_ID = '6fefc037';

type SeasonRow = {
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

type GradeRow = {
    season_key: string;
    grade_key: string;
    name: string;
    tier: number;
    division: number | null;
    team_count: number;
    age_band: string | null;
    playhq_id: string;
};

type TeamRow = {
    club_key: string;
    grade_key: string;
    display_name: string;
    squad_number: number | null;
    playhq_id: string;
};

export type FetchOptions = {
    refresh: boolean;
};

export type FetchReport = {
    seasons: number;
    grades: number;
    teams: number;
    results: number;
    skippedGrades: {
        seasonKey: string;
        gradeName: string;
        teamCount: number;
    }[];
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
    orgId: string,
    refresh: boolean,
): Promise<{ competitionName: string; season: SeasonEntry }[]> {
    const cachePath = resolve(RAW_DIR, `discoverCompetitions_${orgId}.json`);
    const response = (await cachedGraphQL(
        cachePath,
        'discoverCompetitions',
        { organisationID: orgId },
        refresh,
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
function resolveCompetitionKey(
    orgId: string,
    gradeName: string,
): string | null {
    if (orgId === AMND_ORG_ID) return 'amnd';
    const normalised = gradeName.trim().toUpperCase();
    if (normalised === 'PREMIER DIVISION') return 'premier_league';
    if (normalised === 'RESERVES DIVISION') return 'premier_league_reserves';
    return null;
}

function mergeTeams(
    teamRows: Map<string, TeamRow>,
    teams: readonly { key: string; row: TeamRow }[],
): void {
    for (const { key, row } of teams) {
        if (!teamRows.has(key)) teamRows.set(key, row);
    }
}

function teamKeyOf(t: TeamRow): string {
    return `${t.grade_key}|${t.club_key}|${t.squad_number ?? -1}`;
}

function resultKeyOf(r: Record<string, CsvValue>): string {
    return `${String(r.grade_key)}|${String(r.ladder_position).padStart(4, '0')}`;
}

type GradeContext = {
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
): void {
    const squadNumber = extractSquadNumber(standing.team.name);
    const teamKey = `${gradeKey}|${clubKey}|${squadNumber ?? 'null'}`;
    if (teams.has(teamKey)) return;
    teams.set(teamKey, {
        club_key: clubKey,
        grade_key: gradeKey,
        display_name: standing.team.name,
        squad_number: squadNumber,
        playhq_id: standing.team.id,
    });
}

function processGrade(
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

    const results = mapStandingsToResults(
        gradeKey,
        standings,
        (organisationId, organisationName) =>
            clubRegistry.resolve(organisationId, organisationName),
        scrapedAt,
    );

    const teams = new Map<string, TeamRow>();
    for (const standing of standings) {
        const clubKey = clubRegistry.resolve(
            standing.team.organisation.id,
            standing.team.organisation.name,
        );
        registerTeam(teams, gradeKey, clubKey, standing);
    }

    return {
        seasonKey,
        seasonRow,
        gradeRow,
        results,
        teams: [...teams.entries()].map(([key, row]) => ({ key, row })),
    };
}

export async function runFetch(options: FetchOptions): Promise<FetchReport> {
    const { refresh } = options;
    await mkdir(RAW_DIR, { recursive: true });

    const existingSeasons =
        await readExistingCsv<Record<string, string>>('seasons.csv');
    const isFinalBySeasonKey = new Map(
        existingSeasons.map((row) => [row.season_key, row.is_final]),
    );

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
    const clubRegistry = new ClubRegistry(existingClubs, existingAliases);

    const seasonRows = new Map<string, SeasonRow>();
    const gradeRows: GradeRow[] = [];
    const teamRows = new Map<string, TeamRow>();
    const resultRows: Record<string, CsvValue>[] = [];
    const skippedGrades: FetchReport['skippedGrades'] = [];

    const jobs: {
        orgId: string;
        period: 'winter' | 'annual';
        minYear: number;
    }[] = [
        { orgId: AMND_ORG_ID, period: 'winter', minYear: 2022 },
        { orgId: NETBALL_SA_ORG_ID, period: 'annual', minYear: 2023 },
    ];

    for (const job of jobs) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
        const entries = await discoverSeasons(job.orgId, refresh);
        for (const { season } of entries) {
            const startYear = parseStartYear(season.startDate);
            if (startYear < job.minYear) continue;

            const seasonCachePath = resolve(
                RAW_DIR,
                `gradeListDiscoverSeason_${season.id}.json`,
            );
            // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
            const seasonResponse = (await cachedGraphQL(
                seasonCachePath,
                'gradeListDiscoverSeason',
                { id: season.id },
                refresh,
            )) as GradeListDiscoverSeasonResponse;

            const discoverSeason = seasonResponse.data.discoverSeason;
            if (discoverSeason === null) {
                console.warn(
                    `discoverSeason returned null for season ${season.id} (${season.name}), skipping`,
                );
                continue;
            }

            for (const grade of discoverSeason.grades) {
                const competitionKey = resolveCompetitionKey(
                    job.orgId,
                    grade.name,
                );
                // Out of scope, e.g. "Walking Netball 50+" under the Premier League season.
                if (competitionKey === null) continue;

                const gradeCachePath = resolve(
                    RAW_DIR,
                    `gradeLadder_${grade.id}.json`,
                );
                // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
                const gradeResponse = (await cachedGraphQL(
                    gradeCachePath,
                    'gradeLadder',
                    { gradeID: grade.id },
                    refresh,
                )) as GradeLadderResponse;
                // scraped_at is the raw capture's mtime, not `Date.now()` — so a
                // cache-only re-run (unchanged upstream) reproduces byte-identical
                // CSVs instead of a fresh timestamp on every row every time.
                // eslint-disable-next-line no-await-in-loop -- sequential by design: PlayHQ etiquette caps us at ~1 req/sec.
                const gradeCacheStat = await stat(gradeCachePath);
                const scrapedAt = Math.floor(gradeCacheStat.mtimeMs);

                const discoverGrade = gradeResponse.data.discoverGrade;
                const standings: readonly Standing[] =
                    discoverGrade === null
                        ? []
                        : flattenStandings(discoverGrade.ladder);

                const seasonKeyPreview = buildSeasonKey(
                    competitionKey,
                    job.period,
                    startYear,
                );
                if (standings.length < 2) {
                    skippedGrades.push({
                        seasonKey: seasonKeyPreview,
                        gradeName: grade.name,
                        teamCount: standings.length,
                    });
                    continue;
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
                        isFinalBySeasonKey,
                    },
                    clubRegistry,
                    scrapedAt,
                );
                // Unreachable: already filtered above. Kept for type safety.
                if (processed === null) continue;
                if (!seasonRows.has(processed.seasonKey)) {
                    seasonRows.set(processed.seasonKey, processed.seasonRow);
                }
                gradeRows.push(processed.gradeRow);
                resultRows.push(...processed.results);
                mergeTeams(teamRows, processed.teams);
            }
        }
    }

    const sortedSeasons = [...seasonRows.values()].sort((a, b) =>
        a.season_key.localeCompare(b.season_key),
    );
    const sortedGrades = [...gradeRows].sort((a, b) =>
        a.grade_key.localeCompare(b.grade_key),
    );
    const sortedTeams = [...teamRows.values()].sort((a, b) =>
        teamKeyOf(a).localeCompare(teamKeyOf(b)),
    );
    const sortedResults = [...resultRows].sort((a, b) =>
        resultKeyOf(a).localeCompare(resultKeyOf(b)),
    );

    await writeFile(
        resolve(DATA_DIR, 'seasons.csv'),
        toCsv(sortedSeasons),
        'utf8',
    );
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
    await writeFile(
        resolve(DATA_DIR, 'grades.csv'),
        toCsv(sortedGrades),
        'utf8',
    );
    await writeFile(resolve(DATA_DIR, 'teams.csv'), toCsv(sortedTeams), 'utf8');
    await writeFile(
        resolve(DATA_DIR, 'team_season_results.csv'),
        toCsv(sortedResults),
        'utf8',
    );

    return {
        seasons: sortedSeasons.length,
        grades: sortedGrades.length,
        teams: sortedTeams.length,
        results: sortedResults.length,
        skippedGrades,
    };
}
