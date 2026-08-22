/**
 * Orchestrates stage 2 of the pipeline: `data/*.csv` -> D1. Pure and offline —
 * reads only from disk, talks to D1 only through the injected `ImportExecutor`
 * (see `src/pipeline/import/executors.ts` for the wrangler-CLI and in-memory
 * implementations). Thin CLI wrapper lives in `scripts/import-csv.ts`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCsv } from '@/pipeline/csv';
import { generateImportSql } from '@/pipeline/import/generate-sql';
import {
    parseClubAliasRow,
    parseClubRow,
    parseGameRow,
    parseGradeRow,
    parseSeasonRow,
    parseTeamRow,
    parseTeamSeasonResultRow,
} from '@/pipeline/import/parse';
import type {
    GameImportRow,
    ImportData,
    ImportExecutor,
    PlayedMismatchWarning,
    TeamCountWarning,
    UnresolvedTeamWarning,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';
import { validateImportData } from '@/pipeline/import/validate';

export interface ImportReport {
    seasons: number;
    games: number;
    clubs: number;
    clubAliases: number;
    grades: number;
    teams: number;
    results: number;
    warnings: TeamCountWarning[];
    playedMismatchWarnings: PlayedMismatchWarning[];
    unresolvedTeamWarnings: UnresolvedTeamWarning[];
}

async function readCsv(
    dataDir: string,
    file: string,
): Promise<Record<string, string>[]> {
    const text = await readFile(resolve(dataDir, file), 'utf-8');
    return parseCsv(text);
}

/**
 * Fixtures are split per season (`games-2025.csv`, `games-2026.csv`) to keep
 * each file reviewable in a diff, so they are discovered rather than named.
 * A directory with no games file at all is valid — the fixture backfill is
 * independent of the ladder import.
 */
async function readGameCsvs(dataDir: string): Promise<GameImportRow[]> {
    const entries = await readdir(dataDir);
    const files = entries
        .filter((name) => /^games-\d{4}\.csv$/u.test(name))
        .toSorted((a, b) => a.localeCompare(b));
    const perFile = await Promise.all(
        files.map(async (file) => {
            const rows = await readCsv(dataDir, file);
            return rows.map((raw) => parseGameRow(raw, file));
        }),
    );
    return perFile.flat();
}

export async function loadImportData(dataDir: string): Promise<ImportData> {
    const [seasons, clubs, clubAliases, grades, teams, results, games] =
        await Promise.all([
            readCsv(dataDir, 'seasons.csv'),
            readCsv(dataDir, 'clubs.csv'),
            readCsv(dataDir, 'club_aliases.csv'),
            readCsv(dataDir, 'grades.csv'),
            readCsv(dataDir, 'teams.csv'),
            readCsv(dataDir, 'team_season_results.csv'),
            readGameCsvs(dataDir),
        ]);
    return {
        clubAliases: clubAliases.map(parseClubAliasRow),
        clubs: clubs.map(parseClubRow),
        games,
        grades: grades.map(parseGradeRow),
        results: results.map(parseTeamSeasonResultRow),
        seasons: seasons.map(parseSeasonRow),
        teams: teams.map(parseTeamRow),
    };
}

/**
 * `competitions` and `grade_weights` are owned by `drizzle/0001_seed.sql`,
 * not this importer — one writer per table. We only verify they're present
 * and fail loudly (rather than silently importing against an empty
 * catalogue) if migrations haven't been applied yet.
 */
async function loadCompetitionKeys(
    queryAll: (sql: string) => Promise<Record<string, unknown>[]>,
): Promise<ReadonlySet<string>> {
    const [competitions, weights] = await Promise.all([
        queryAll('SELECT key FROM competitions;'),
        queryAll('SELECT id FROM grade_weights LIMIT 1;'),
    ]);
    if (competitions.length === 0 || weights.length === 0) {
        throw new ImportValidationError(
            'database',
            null,
            'competitions/grade_weights are empty — run `pnpm run db:migrate:local` (or :remote) before importing',
        );
    }
    return new Set(competitions.map((row) => String(row.key)));
}

/**
 * Final safety net: after every batch has been applied, count rows actually
 * in D1 per table and compare against the rows read from CSV. A CSV/D1
 * divergence here means some rows were dropped (or duplicated) somewhere in
 * the upsert path despite passing validation — that must fail loudly, not
 * report a row count that never happened.
 */
async function assertRowCountsMatch(
    queryAll: (sql: string) => Promise<Record<string, unknown>[]>,
    data: ImportData,
): Promise<void> {
    const tables: { table: string; expected: number }[] = [
        { expected: data.seasons.length, table: 'seasons' },
        { expected: data.clubs.length, table: 'clubs' },
        { expected: data.clubAliases.length, table: 'club_aliases' },
        { expected: data.grades.length, table: 'grades' },
        { expected: data.teams.length, table: 'teams' },
        { expected: data.results.length, table: 'team_season_results' },
        { expected: data.games.length, table: 'games' },
    ];
    for (const { table, expected } of tables) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- small fixed list, sequential is fine and keeps errors ordered
        const rows = await queryAll(`SELECT COUNT(*) AS n FROM ${table};`);
        const actual = Number(rows[0]?.n ?? Number.NaN);
        if (actual !== expected) {
            throw new ImportValidationError(
                'database',
                null,
                `row count mismatch after import: ${table} has ${String(actual)} row(s) in D1 but ${String(expected)} were read from CSV`,
                { actual, expected, table },
            );
        }
    }
}

/**
 * Belt-and-braces for `toScoringRow`'s `weight: row.weight ?? 0` fallback in
 * `src/db/queries/results.ts`: that fallback exists so a missing weight row
 * degrades to "scores nothing" instead of throwing mid-render, but it must
 * never actually fire for a championship competition. A grade whose
 * `(competition, tier, division)` has no matching row in `grade_weights` —
 * e.g. a mistyped AMND tier — would otherwise import cleanly and silently
 * score zero for every team in it.
 *
 * Competitions with no `grade_weights` at all (metro associations, name-only
 * seeds) are not in the championship. They stay unweighted on purpose.
 * Inventing bands just to pass this check would mix them into AMND scoring.
 * `assertRowCountsMatch` only checks table sizes, not this coverage.
 */
async function assertGradeWeightCoverage(
    queryAll: (sql: string) => Promise<Record<string, unknown>[]>,
): Promise<void> {
    const unweighted = await queryAll(`
        SELECT g.grade_key AS gradeKey, s.start_year AS year
        FROM grades g
        JOIN seasons s ON s.id = g.season_id
        JOIN competitions c ON c.id = s.competition_id
        LEFT JOIN grade_weights gw
            ON gw.competition_id = s.competition_id
            AND gw.tier = g.tier
            AND gw.division IS g.division
        WHERE gw.id IS NULL
          AND EXISTS (
            SELECT 1 FROM grade_weights w WHERE w.competition_id = c.id
          );
    `);
    if (unweighted.length > 0) {
        const offenders = unweighted
            .map((row) => `${String(row.gradeKey)} (${String(row.year)})`)
            .join(', ');
        throw new ImportValidationError(
            'database',
            null,
            `grade_weights does not cover every imported grade — unweighted: ${offenders}`,
            { unweighted },
        );
    }
}

export interface RunImportOptions {
    dataDir: string;
    executor: ImportExecutor;
}

export type ImportCountsMode = 'exact' | 'subset';

export async function runImportData(
    data: ImportData,
    executor: ImportExecutor,
    counts: ImportCountsMode,
): Promise<ImportReport> {
    const competitionKeys = await loadCompetitionKeys(executor.queryAll);
    const {
        teamCountWarnings,
        playedMismatchWarnings,
        unresolvedTeamWarnings,
    } = validateImportData(data, competitionKeys);

    const skipped = new Set(
        unresolvedTeamWarnings.map(
            (warning) => `${warning.gradeKey}:${warning.playhqId}`,
        ),
    );
    data.games = data.games.filter(
        (game) => !skipped.has(`${game.gradeKey}:${game.playhqId}`),
    );

    const batches = generateImportSql(data);
    for (const batch of batches) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential by requirement: later batches depend on rows earlier ones insert
        await executor.batch(batch.statements);
    }

    if (counts === 'exact') {
        await assertRowCountsMatch(executor.queryAll, data);
    }
    await assertGradeWeightCoverage(executor.queryAll);

    return {
        clubAliases: data.clubAliases.length,
        clubs: data.clubs.length,
        games: data.games.length,
        grades: data.grades.length,
        playedMismatchWarnings,
        results: data.results.length,
        seasons: data.seasons.length,
        teams: data.teams.length,
        unresolvedTeamWarnings,
        warnings: teamCountWarnings,
    };
}

export async function runImport(
    options: RunImportOptions,
): Promise<ImportReport> {
    const { dataDir, executor } = options;
    const data = await loadImportData(dataDir);
    return await runImportData(data, executor, 'exact');
}
