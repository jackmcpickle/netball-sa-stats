import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import { runImport } from '@/pipeline/import/run';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';
import { ImportValidationError } from '@/pipeline/import/types';

const FIXTURE_DIR = resolve(import.meta.dirname, '__fixtures__/basic');

function tableRows(db: DatabaseSync, table: string): Record<string, unknown>[] {
    return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

describe('runImport', () => {
    let db: DatabaseSync;

    beforeEach(async () => {
        db = await createMigratedDb();
    });

    afterEach(() => {
        db.close();
    });

    it('loads every row from the fixture into D1', async () => {
        const report = await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });

        expect(report).toMatchObject({
            seasons: 2,
            clubs: 2,
            clubAliases: 2,
            grades: 4,
            teams: 8,
            results: 8,
        });
        expect(tableRows(db, 'seasons')).toHaveLength(2);
        expect(tableRows(db, 'clubs')).toHaveLength(2);
        expect(tableRows(db, 'grades')).toHaveLength(4);
        expect(tableRows(db, 'teams')).toHaveLength(8);
        expect(tableRows(db, 'team_season_results')).toHaveLength(8);
    });

    it('resolves string keys to the correct foreign-key ids', async () => {
        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });

        const grade = db
            .prepare(
                "SELECT id, season_id FROM grades WHERE grade_key = 'amnd-winter-2023-a-grade'",
            )
            .get() as { id: number; season_id: number };
        const season = db
            .prepare(
                "SELECT id FROM seasons WHERE season_key = 'amnd-winter-2023'",
            )
            .get() as { id: number };
        expect(grade.season_id).toBe(season.id);

        const team = db
            .prepare(
                "SELECT club_id, grade_id FROM teams WHERE display_name = 'Fixture Club A' AND grade_id = ?",
            )
            .get(grade.id) as { club_id: number; grade_id: number };
        const club = db
            .prepare("SELECT id FROM clubs WHERE club_key = 'fixture-club-a'")
            .get() as { id: number };
        expect(team.club_id).toBe(club.id);
        expect(team.grade_id).toBe(grade.id);
    });

    it('is idempotent — importing the fixture twice leaves identical state', async () => {
        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        const first = {
            seasons: tableRows(db, 'seasons'),
            clubs: tableRows(db, 'clubs'),
            clubAliases: tableRows(db, 'club_aliases'),
            grades: tableRows(db, 'grades'),
            teams: tableRows(db, 'teams'),
            results: tableRows(db, 'team_season_results'),
        };

        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        const second = {
            seasons: tableRows(db, 'seasons'),
            clubs: tableRows(db, 'clubs'),
            clubAliases: tableRows(db, 'club_aliases'),
            grades: tableRows(db, 'grades'),
            teams: tableRows(db, 'teams'),
            results: tableRows(db, 'team_season_results'),
        };

        expect(second).toEqual(first);
    });

    it('fails loudly if competitions/grade_weights are not seeded', async () => {
        const empty = await createMigratedDb();
        empty.exec('DELETE FROM grade_weights; DELETE FROM competitions;');

        await expect(
            runImport({
                dataDir: FIXTURE_DIR,
                executor: createSqliteExecutor(empty),
            }),
        ).rejects.toThrow(ImportValidationError);

        empty.close();
    });
});
