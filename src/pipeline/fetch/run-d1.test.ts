import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CollectOptions, CollectedPlayHq } from '@/pipeline/fetch/collect';
import { runFetch } from '@/pipeline/fetch/run';
import { toImportData } from '@/pipeline/fetch/to-import';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';

function stubCollect(options: CollectOptions): Promise<CollectedPlayHq> {
    const clubA = options.clubRegistry.resolve('org-club-a', 'Fixture Club A');
    const clubB = options.clubRegistry.resolve('org-club-b', 'Fixture Club B');
    const season = {
        competition_key: 'amnd',
        competition_period: 'winter' as const,
        end_year: 2024,
        is_final: 0,
        label: 'Winter 2024',
        playhq_id: 'season-2024',
        season_key: 'amnd-winter-2024',
        source: 'playhq' as const,
        start_year: 2024,
        status: 'completed',
    };
    const grade = {
        age_band: 'Senior',
        division: null,
        grade_key: 'amnd-winter-2024-a-grade',
        name: 'A Grade',
        playhq_id: 'grade-2024',
        season_key: season.season_key,
        team_count: 2,
        tier: 4,
    };
    const teams = [
        {
            club_key: clubA,
            display_name: 'Fixture Club A',
            grade_key: grade.grade_key,
            playhq_id: 'team-a',
            squad_number: null,
        },
        {
            club_key: clubB,
            display_name: 'Fixture Club B',
            grade_key: grade.grade_key,
            playhq_id: 'team-b',
            squad_number: null,
        },
    ];
    const results = [
        {
            byes: 0,
            club_key: clubA,
            display_name: 'Fixture Club A',
            drawn: 0,
            goal_difference: 100,
            goals_against: 400,
            goals_for: 500,
            grade_key: grade.grade_key,
            ladder_position: 1,
            lost: 2,
            notes: null,
            percentage: 125,
            placement_basis: 'regular_season_ladder',
            played: 10,
            playhq_id: 'team-a',
            points: 16,
            position_uncertain: 0,
            scraped_at: 1_700_000_000_000,
            shots_attempted: null,
            shots_scored: null,
            source: 'playhq',
            squad_number: null,
            won: 8,
        },
        {
            byes: 0,
            club_key: clubB,
            display_name: 'Fixture Club B',
            drawn: 0,
            goal_difference: -100,
            goals_against: 500,
            goals_for: 400,
            grade_key: grade.grade_key,
            ladder_position: 2,
            lost: 8,
            notes: null,
            percentage: 80,
            placement_basis: 'regular_season_ladder',
            played: 10,
            playhq_id: 'team-b',
            points: 4,
            position_uncertain: 0,
            scraped_at: 1_700_000_000_000,
            shots_attempted: null,
            shots_scored: null,
            source: 'playhq',
            squad_number: null,
            won: 2,
        },
    ];
    return Promise.resolve({
        gamesByYear: new Map(),
        grades: [grade],
        importData: toImportData({
            aliases: options.clubRegistry.getAliases(),
            clubs: options.clubRegistry.getClubs(),
            games: [],
            grades: [grade],
            results,
            seasons: [season],
            teams,
        }),
        report: {
            games: 0,
            grades: 1,
            results: 2,
            seasons: 1,
            skippedGrades: [],
            teams: 2,
        },
        results,
        seasons: [season],
        teams,
    });
}

describe(runFetch, () => {
    let db: DatabaseSync;
    let dataDir: string;

    beforeEach(async () => {
        db = await createMigratedDb();
        dataDir = await mkdtemp(join(tmpdir(), 'netball-fetch-'));
    });

    afterEach(async () => {
        db.close();
        await rm(dataDir, { force: true, recursive: true });
    });

    it('upserts into D1 and does not write generated entity CSVs', async () => {
        const report = await runFetch({
            collect: stubCollect,
            dataDir,
            executor: createSqliteExecutor(db),
            rawDir: join(dataDir, 'raw'),
            refresh: false,
            years: [2024],
        });

        expect(report.seasons).toBe(1);
        expect(report.results).toBe(2);
        expect(existsSync(join(dataDir, 'seasons.csv'))).toBeFalsy();
        expect(existsSync(join(dataDir, 'grades.csv'))).toBeFalsy();
        expect(existsSync(join(dataDir, 'teams.csv'))).toBeFalsy();
        expect(existsSync(join(dataDir, 'team_season_results.csv'))).toBeFalsy();
        expect(existsSync(join(dataDir, 'games-2024.csv'))).toBeFalsy();
        expect(existsSync(join(dataDir, 'clubs.csv'))).toBeTruthy();
        expect(existsSync(join(dataDir, 'club_aliases.csv'))).toBeTruthy();

        // SAFETY: COUNT(*) always yields one numeric row.
        const seasons = db
            .prepare('SELECT COUNT(*) AS n FROM seasons')
            .get() as { n: number };
        expect(seasons.n).toBe(1);
        // SAFETY: COUNT(*) always yields one numeric row.
        const results = db
            .prepare('SELECT COUNT(*) AS n FROM team_season_results')
            .get() as { n: number };
        expect(results.n).toBe(2);
    });
});
