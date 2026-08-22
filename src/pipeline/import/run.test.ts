import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import {
    loadImportData,
    runImport,
    runImportData,
} from '@/pipeline/import/run';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';
import type { ImportData, ImportExecutor } from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';

const FIXTURE_DIR = resolve(import.meta.dirname, '__fixtures__/basic');
const TWO_TEAMS_ONE_CLUB_FIXTURE_DIR = resolve(
    import.meta.dirname,
    '__fixtures__/two-teams-one-club',
);
const GAMES_FIXTURE_DIR = resolve(import.meta.dirname, '__fixtures__/games');
const GAMES_UNKNOWN_TEAM_FIXTURE_DIR = resolve(
    import.meta.dirname,
    '__fixtures__/games-unknown-team',
);

function tableRows(db: DatabaseSync, table: string): Record<string, unknown>[] {
    return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}

describe(runImport, () => {
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
            clubAliases: 2,
            clubs: 2,
            grades: 4,
            results: 8,
            seasons: 2,
            teams: 8,
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

        // SAFETY: the asserted shape is the SELECT list of the statement on
        // the same expression; `id`/`season_id` are NOT NULL integer columns.
        const grade = db
            .prepare(
                "SELECT id, season_id FROM grades WHERE grade_key = 'amnd-winter-2023-a-grade'",
            )
            .get() as { id: number; season_id: number };
        // SAFETY: as above — `id` is the table's INTEGER PRIMARY KEY.
        const season = db
            .prepare(
                "SELECT id FROM seasons WHERE season_key = 'amnd-winter-2023'",
            )
            .get() as { id: number };
        expect(grade.season_id).toBe(season.id);

        // SAFETY: the asserted shape is the SELECT list on the same
        // expression; both are NOT NULL foreign-key columns.
        const team = db
            .prepare(
                "SELECT club_id, grade_id FROM teams WHERE display_name = 'Fixture Club A' AND grade_id = ?",
            )
            .get(grade.id) as { club_id: number; grade_id: number };
        // SAFETY: as above — `id` is the table's INTEGER PRIMARY KEY.
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
            clubAliases: tableRows(db, 'club_aliases'),
            clubs: tableRows(db, 'clubs'),
            grades: tableRows(db, 'grades'),
            results: tableRows(db, 'team_season_results'),
            seasons: tableRows(db, 'seasons'),
            teams: tableRows(db, 'teams'),
        };

        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        const second = {
            clubAliases: tableRows(db, 'club_aliases'),
            clubs: tableRows(db, 'clubs'),
            grades: tableRows(db, 'grades'),
            results: tableRows(db, 'team_season_results'),
            seasons: tableRows(db, 'seasons'),
            teams: tableRows(db, 'teams'),
        };

        expect(second).toStrictEqual(first);
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

    it('imports two teams of one club in one grade (e.g. Walkerville 1 / Walkerville 2) as two distinct rows, not one collapsed row', async () => {
        const report = await runImport({
            dataDir: TWO_TEAMS_ONE_CLUB_FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });

        expect(report).toMatchObject({ results: 2, teams: 2 });
        expect(tableRows(db, 'teams')).toHaveLength(2);
        expect(tableRows(db, 'team_season_results')).toHaveLength(2);
        // SAFETY: `teams.display_name` is `TEXT NOT NULL` in the schema, and
        // `tableRows` selects every column of the row just imported.
        const teams = tableRows(db, 'teams') as { display_name: string }[];
        expect(teams.map((t) => t.display_name).toSorted()).toStrictEqual([
            'Walkerville 1',
            'Walkerville 2',
        ]);
    });

    it('fails loudly when D1 row counts diverge from the CSV row counts after import', async () => {
        // Wraps a real sqlite executor but drops one team_season_results
        // insert to simulate a bug that silently loses a row mid-batch —
        // the end-of-run assertion must catch it even though every
        // individual statement "succeeded".
        const real = createSqliteExecutor(db);
        const lossy: ImportExecutor = {
            batch: async (statements) => {
                const filtered = statements.filter(
                    (sql) => !sql.includes('team_season_results'),
                );
                await real.batch(filtered);
            },
            queryAll: real.queryAll,
        };

        await expect(
            runImport({ dataDir: FIXTURE_DIR, executor: lossy }),
        ).rejects.toThrow(ImportValidationError);
        await expect(
            runImport({ dataDir: FIXTURE_DIR, executor: lossy }),
        ).rejects.toThrow(/row count mismatch/u);
    });

    it('upserts a subset without deleting other seasons or asserting whole-table counts', async () => {
        await runImport({
            dataDir: FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });

        const full = await loadImportData(FIXTURE_DIR);
        const seasonKey = 'amnd-winter-2024';
        const gradeKeys = new Set(
            full.grades
                .filter((grade) => grade.seasonKey === seasonKey)
                .map((grade) => grade.gradeKey),
        );
        const subset: ImportData = {
            clubAliases: full.clubAliases,
            clubs: full.clubs,
            games: full.games.filter((game) => gradeKeys.has(game.gradeKey)),
            grades: full.grades.filter(
                (grade) => grade.seasonKey === seasonKey,
            ),
            results: full.results.filter((result) =>
                gradeKeys.has(result.gradeKey),
            ),
            seasons: full.seasons
                .filter((season) => season.seasonKey === seasonKey)
                .map((season) => ({
                    ...season,
                    label: 'Updated Winter 2024',
                    playhqId: 'updated-playhq-id',
                })),
            teams: full.teams.filter((team) => gradeKeys.has(team.gradeKey)),
        };

        await expect(
            runImportData(subset, createSqliteExecutor(db), 'subset'),
        ).resolves.toBeDefined();

        expect(tableRows(db, 'seasons')).toHaveLength(2);
        // SAFETY: the asserted shape is the SELECT list on the same
        // expression, aliased to match; the row was just imported above.
        const updated = db
            .prepare(
                'SELECT label, playhq_id AS playhqId FROM seasons WHERE season_key = ?',
            )
            .get(seasonKey) as { label: string; playhqId: string };
        expect(updated.label).toBe('Updated Winter 2024');
        expect(updated.playhqId).toBe('updated-playhq-id');
    });

    it('fails loudly when an imported grade has no matching grade_weights row', async () => {
        // The fixture's A Grade rows are AMND tier 4, division NULL — drop
        // that weight row so the join has nothing to match, the same shape
        // of gap that let `Inter. 6` and `Primary 7` score zero silently
        // before this assertion existed.
        db.exec(
            "DELETE FROM grade_weights WHERE tier = 4 AND division IS NULL AND competition_id = (SELECT id FROM competitions WHERE key = 'amnd');",
        );

        await expect(
            runImport({
                dataDir: FIXTURE_DIR,
                executor: createSqliteExecutor(db),
            }),
        ).rejects.toThrow(ImportValidationError);
        await expect(
            runImport({
                dataDir: FIXTURE_DIR,
                executor: createSqliteExecutor(db),
            }),
        ).rejects.toThrow(/grade_weights does not cover every imported grade/u);
    });

    it('imports an association grade that has no championship weights', async () => {
        const full = await loadImportData(FIXTURE_DIR);
        const extra: ImportData = {
            ...full,
            grades: [
                ...full.grades,
                {
                    ageBand: 'Senior',
                    division: 1,
                    gradeKey: 'saucna-winter-2024-a1',
                    name: 'A1',
                    playhqId: 'saucna-grade',
                    seasonKey: 'saucna-winter-2024',
                    teamCount: 2,
                    tier: 20,
                },
            ],
            results: [
                ...full.results,
                {
                    byes: 0,
                    clubKey: 'fixture-club-a',
                    displayName: 'Fixture Club A',
                    drawn: 0,
                    goalDifference: 20,
                    goalsAgainst: 80,
                    goalsFor: 100,
                    gradeKey: 'saucna-winter-2024-a1',
                    ladderPosition: 1,
                    lost: 0,
                    notes: null,
                    percentage: 125,
                    placementBasis: 'regular_season_ladder',
                    played: 10,
                    playhqId: 'saucna-team-a',
                    points: 20,
                    positionUncertain: false,
                    scrapedAt: 1_700_000_002,
                    shotsAttempted: null,
                    shotsScored: null,
                    source: 'playhq',
                    squadNumber: null,
                    won: 10,
                },
                {
                    byes: 0,
                    clubKey: 'fixture-club-b',
                    displayName: 'Fixture Club B',
                    drawn: 0,
                    goalDifference: -20,
                    goalsAgainst: 100,
                    goalsFor: 80,
                    gradeKey: 'saucna-winter-2024-a1',
                    ladderPosition: 2,
                    lost: 10,
                    notes: null,
                    percentage: 80,
                    placementBasis: 'regular_season_ladder',
                    played: 10,
                    playhqId: 'saucna-team-b',
                    points: 0,
                    positionUncertain: false,
                    scrapedAt: 1_700_000_002,
                    shotsAttempted: null,
                    shotsScored: null,
                    source: 'playhq',
                    squadNumber: null,
                    won: 0,
                },
            ],
            seasons: [
                ...full.seasons,
                {
                    competitionKey: 'saucna',
                    competitionPeriod: 'winter',
                    endYear: 2024,
                    isFinal: true,
                    label: 'Winter 2024',
                    playhqId: 'saucna-2024',
                    seasonKey: 'saucna-winter-2024',
                    source: 'playhq',
                    startYear: 2024,
                },
            ],
            teams: [
                ...full.teams,
                {
                    clubKey: 'fixture-club-a',
                    displayName: 'Fixture Club A',
                    gradeKey: 'saucna-winter-2024-a1',
                    playhqId: 'saucna-team-a',
                    squadNumber: null,
                },
                {
                    clubKey: 'fixture-club-b',
                    displayName: 'Fixture Club B',
                    gradeKey: 'saucna-winter-2024-a1',
                    playhqId: 'saucna-team-b',
                    squadNumber: null,
                },
            ],
        };

        await expect(
            runImportData(extra, createSqliteExecutor(db), 'exact'),
        ).resolves.toMatchObject({
            grades: extra.grades.length,
            seasons: extra.seasons.length,
        });
    });
});

describe('games import', () => {
    let db: DatabaseSync;

    beforeEach(async () => {
        db = await createMigratedDb();
    });

    afterEach(() => {
        db.close();
    });

    it('imports finals, forfeits, byes and no-results with their statuses', async () => {
        const report = await runImport({
            dataDir: GAMES_FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        expect(report.games).toBe(4);

        // SAFETY: the asserted shape is the aliased SELECT list on the same
        // expression, over rows this test just imported from the fixture.
        const rows = db
            .prepare(
                `SELECT g.playhq_id AS playhqId, g.status, g.round,
                        g.forfeiting_side AS forfeitingSide,
                        g.home_score AS homeScore, g.away_score AS awayScore,
                        home.display_name AS homeName,
                        away.display_name AS awayName
                 FROM games g
                 LEFT JOIN teams home ON home.id = g.home_team_id
                 LEFT JOIN teams away ON away.id = g.away_team_id
                 ORDER BY g.round;`,
            )
            .all() as Record<string, unknown>[];

        expect(rows.map((row) => row.status)).toStrictEqual([
            'final',
            'forfeit',
            'bye',
            'no_result',
        ]);
        // Team ids resolved through the grade-scoped natural key.
        expect(rows[0].homeName).toBe('Fixture Club A');
        expect(rows[0].awayName).toBe('Fixture Club B');
        expect(rows[1].forfeitingSide).toBe('away');
        // A bye has one side and no score.
        expect(rows[2].awayName).toBeNull();
        expect(rows[2].homeScore).toBeNull();
    });

    it('is idempotent — a re-import leaves the same four rows', async () => {
        const options = {
            dataDir: GAMES_FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        };
        await runImport(options);
        await runImport(options);
        // SAFETY: `COUNT(*)` always yields exactly one row with a numeric `n`.
        const count = db.prepare('SELECT COUNT(*) AS n FROM games;').get() as {
            n: number;
        };
        expect(count.n).toBe(4);
    });

    it('skips and reports a game whose team is on no ladder anywhere', async () => {
        // Never imported with an invented team, and never silently dropped:
        // the row is reported so a systematic fault is visible.
        const report = await runImport({
            dataDir: GAMES_UNKNOWN_TEAM_FIXTURE_DIR,
            executor: createSqliteExecutor(db),
        });
        expect(report.games).toBe(0);
        expect(report.unresolvedTeamWarnings).toHaveLength(1);
        expect(report.unresolvedTeamWarnings[0].missingTeamIds).toStrictEqual([
            'ghost-team',
        ]);
        // SAFETY: `COUNT(*)` always yields exactly one row with a numeric `n`.
        const count = db.prepare('SELECT COUNT(*) AS n FROM games;').get() as {
            n: number;
        };
        expect(count.n).toBe(0);
    });
});
