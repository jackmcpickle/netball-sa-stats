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
    const warnings = validateImportData(data, competitionKeys);

    const batches = generateImportSql(data);
    // Batches must run in dependency order (seasons -> ... -> results), so
    // this can't be parallelised with Promise.all.
    for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop -- sequential by requirement
        await executor.batch(batch.statements);
    }

    return {
        seasons: data.seasons.length,
        clubs: data.clubs.length,
        clubAliases: data.clubAliases.length,
        grades: data.grades.length,
        teams: data.teams.length,
        results: data.results.length,
        warnings,
    };
}
