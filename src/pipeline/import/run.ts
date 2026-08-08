/**
 * Orchestrates stage 2 of the pipeline: `data/*.csv` -> D1. Pure and offline —
 * reads only from disk, talks to D1 only through the injected `ImportExecutor`
 * (see `src/pipeline/import/executors.ts` for the wrangler-CLI and in-memory
 * implementations). Thin CLI wrapper lives in `scripts/import-csv.ts`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCsv } from '@/pipeline/csv';
import { generateImportSql } from '@/pipeline/import/generate-sql';
import {
    parseClubAliasRow,
    parseClubRow,
    parseGradeRow,
    parseSeasonRow,
    parseTeamRow,
    parseTeamSeasonResultRow,
} from '@/pipeline/import/parse';
import type {
    ImportData,
    ImportExecutor,
    PlayedMismatchWarning,
    TeamCountWarning,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';
import { validateImportData } from '@/pipeline/import/validate';

export type ImportReport = {
    seasons: number;
    clubs: number;
    clubAliases: number;
    grades: number;
    teams: number;
    results: number;
    warnings: TeamCountWarning[];
    playedMismatchWarnings: PlayedMismatchWarning[];
};

async function readCsv(
    dataDir: string,
    file: string,
): Promise<Record<string, string>[]> {
    const text = await readFile(resolve(dataDir, file), 'utf8');
    return parseCsv(text);
}

export async function loadImportData(dataDir: string): Promise<ImportData> {
    const [seasons, clubs, clubAliases, grades, teams, results] =
        await Promise.all([
            readCsv(dataDir, 'seasons.csv'),
            readCsv(dataDir, 'clubs.csv'),
            readCsv(dataDir, 'club_aliases.csv'),
            readCsv(dataDir, 'grades.csv'),
            readCsv(dataDir, 'teams.csv'),
            readCsv(dataDir, 'team_season_results.csv'),
        ]);
    return {
        seasons: seasons.map(parseSeasonRow),
        clubs: clubs.map(parseClubRow),
        clubAliases: clubAliases.map(parseClubAliasRow),
        grades: grades.map(parseGradeRow),
        teams: teams.map(parseTeamRow),
        results: results.map(parseTeamSeasonResultRow),
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
    const competitions = await queryAll('SELECT key FROM competitions;');
    const weights = await queryAll('SELECT id FROM grade_weights LIMIT 1;');
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
        { table: 'seasons', expected: data.seasons.length },
        { table: 'clubs', expected: data.clubs.length },
        { table: 'club_aliases', expected: data.clubAliases.length },
        { table: 'grades', expected: data.grades.length },
        { table: 'teams', expected: data.teams.length },
        { table: 'team_season_results', expected: data.results.length },
    ];
    for (const { table, expected } of tables) {
        // eslint-disable-next-line no-await-in-loop -- small fixed list, sequential is fine and keeps errors ordered
        const rows = await queryAll(`SELECT COUNT(*) AS n FROM ${table};`);
        const actual = Number(rows[0]?.n ?? Number.NaN);
        if (actual !== expected) {
            throw new ImportValidationError(
                'database',
                null,
                `row count mismatch after import: ${table} has ${String(actual)} row(s) in D1 but ${String(expected)} were read from CSV`,
                { table, actual, expected },
            );
        }
    }
}

/**
 * Belt-and-braces for `toScoringRow`'s `weight: row.weight ?? 0` fallback in
 * `src/db/queries/results.ts`: that fallback exists so a missing weight row
 * degrades to "scores nothing" instead of throwing mid-render, but it must
 * never actually fire in production. A grade whose `(competition, tier,
 * division)` has no matching row in `grade_weights` — e.g. a mistyped tier —
 * would otherwise import cleanly and silently score zero for every team in
 * it. `assertRowCountsMatch` only checks table sizes, not this coverage, so
 * it would not catch it.
 */
async function assertGradeWeightCoverage(
    queryAll: (sql: string) => Promise<Record<string, unknown>[]>,
): Promise<void> {
    const unweighted = await queryAll(`
        SELECT g.grade_key AS gradeKey, s.start_year AS year
        FROM grades g
        JOIN seasons s ON s.id = g.season_id
        LEFT JOIN grade_weights gw
            ON gw.competition_id = s.competition_id
            AND gw.tier = g.tier
            AND gw.division IS g.division
        WHERE gw.id IS NULL;
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

export type RunImportOptions = {
    dataDir: string;
    executor: ImportExecutor;
};

export async function runImport(
    options: RunImportOptions,
): Promise<ImportReport> {
    const { dataDir, executor } = options;
    const data = await loadImportData(dataDir);
    const competitionKeys = await loadCompetitionKeys(executor.queryAll);
    const { teamCountWarnings, playedMismatchWarnings } = validateImportData(
        data,
        competitionKeys,
    );

    // generateImportSql runs after validation, which may have annotated
    // `notes` on mismatched result rows — the SQL must reflect that.
    const batches = generateImportSql(data);
    // Batches must run in dependency order (seasons -> ... -> results), so
    // this can't be parallelised with Promise.all.
    for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop -- sequential by requirement
        await executor.batch(batch.statements);
    }

    await assertRowCountsMatch(executor.queryAll, data);
    await assertGradeWeightCoverage(executor.queryAll);

    return {
        seasons: data.seasons.length,
        clubs: data.clubs.length,
        clubAliases: data.clubAliases.length,
        grades: data.grades.length,
        teams: data.teams.length,
        results: data.results.length,
        warnings: teamCountWarnings,
        playedMismatchWarnings,
    };
}
