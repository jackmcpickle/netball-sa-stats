import type { DatabaseSync } from 'node:sqlite';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import type { CsvValue } from '@/pipeline/csv';
import { createMemoryStore } from '@/pipeline/fetch/capture-store';
import type { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type {
    CollectOptions,
    CollectedPlayHq,
    GradeRow,
    SeasonRow,
    TeamRow,
} from '@/pipeline/fetch/run';
import { toImportData } from '@/pipeline/fetch/to-import';
import { createSqliteExecutor } from '@/pipeline/import/executors';
import { runPlayHqJob } from '@/pipeline/import/playhq-job';
import { createMigratedDb } from '@/pipeline/import/sqlite-test-db';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createTestDb } from '@/server/testing/harness';

const NOW = 1_700_000_000;
const STALE_AFTER_SECONDS = 7200;

function resultRow(
    gradeKey: string,
    clubKey: string,
    playhqId: string,
    displayName: string,
    position: number,
): Record<string, CsvValue> {
    const won = position === 1 ? 8 : 2;
    const lost = position === 1 ? 2 : 8;
    return {
        grade_key: gradeKey,
        club_key: clubKey,
        squad_number: null,
        playhq_id: playhqId,
        display_name: displayName,
        ladder_position: position,
        position_uncertain: 0,
        played: 10,
        won,
        drawn: 0,
        lost,
        byes: 0,
        goals_for: position === 1 ? 500 : 400,
        goals_against: position === 1 ? 400 : 500,
        goal_difference: position === 1 ? 100 : -100,
        points: position === 1 ? 16 : 4,
        percentage: position === 1 ? 125 : 80,
        shots_attempted: null,
        shots_scored: null,
        source: 'playhq',
        placement_basis: 'regular_season_ladder',
        notes: null,
        scraped_at: 1_700_000_000_000,
    };
}

function seasonBundle(
    clubA: string,
    clubB: string,
    startYear: number,
    status: string,
): {
    season: SeasonRow;
    grade: GradeRow;
    teams: TeamRow[];
    results: Record<string, CsvValue>[];
} {
    const seasonKey = `amnd-winter-${String(startYear)}`;
    const gradeKey = `${seasonKey}-a-grade`;
    const teamA = `team-a-${String(startYear)}-agrade`;
    const teamB = `team-b-${String(startYear)}-agrade`;
    return {
        season: {
            competition_key: 'amnd',
            season_key: seasonKey,
            competition_period: 'winter',
            label: `Winter ${String(startYear)}`,
            start_year: startYear,
            end_year: startYear,
            is_final: 0,
            playhq_id: `season-${String(startYear)}`,
            source: 'playhq',
            status,
        },
        grade: {
            season_key: seasonKey,
            grade_key: gradeKey,
            name: 'A Grade',
            tier: 4,
            division: null,
            team_count: 2,
            age_band: 'Senior',
            playhq_id: `grade-${String(startYear)}`,
        },
        teams: [
            {
                club_key: clubA,
                grade_key: gradeKey,
                display_name: 'Fixture Club A',
                squad_number: null,
                playhq_id: teamA,
            },
            {
                club_key: clubB,
                grade_key: gradeKey,
                display_name: 'Fixture Club B',
                squad_number: null,
                playhq_id: teamB,
            },
        ],
        results: [
            resultRow(gradeKey, clubA, teamA, 'Fixture Club A', 1),
            resultRow(gradeKey, clubB, teamB, 'Fixture Club B', 2),
        ],
    };
}

function stubCollected(clubRegistry: ClubRegistry): CollectedPlayHq {
    const clubA = clubRegistry.resolve('org-club-a', 'Fixture Club A');
    const clubB = clubRegistry.resolve('org-club-b', 'Fixture Club B');
    const completed = seasonBundle(clubA, clubB, 2024, 'completed');
    const active = seasonBundle(clubA, clubB, 2026, 'active');
    const seasons = [completed.season, active.season];
    const grades = [completed.grade, active.grade];
    const teams = [...completed.teams, ...active.teams];
    const results = [...completed.results, ...active.results];
    return {
        importData: toImportData({
            seasons,
            clubs: clubRegistry.getClubs(),
            aliases: clubRegistry.getAliases(),
            grades,
            teams,
            results,
            games: [],
        }),
        report: {
            seasons: seasons.length,
            grades: grades.length,
            teams: teams.length,
            results: results.length,
            games: 0,
            skippedGrades: [],
        },
        seasons,
        grades,
        teams,
        results,
        gamesByYear: new Map(),
    };
}

function stubCollect(): Mock<
    (options: CollectOptions) => Promise<CollectedPlayHq>
> {
    return vi.fn(async (options: CollectOptions): Promise<CollectedPlayHq> => {
        return stubCollected(options.clubRegistry);
    });
}

describe('runPlayHqJob', () => {
    let db: DatabaseSync;
    const store = createMemoryStore();
    const isFinalBySeasonKey = new Map<string, string>();

    beforeEach(async () => {
        db = await createMigratedDb();
    });

    afterEach(() => {
        db.close();
    });

    it('imports via injected collect and records an ok import_runs row', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = stubCollect();
        const result = await runPlayHqJob({
            params: { games: true },
            store,
            executor: createSqliteExecutor(db),
            cacheFirst: true,
            nowEpochSeconds: NOW,
            instanceId: 'job-ok',
            runs,
            isFinalBySeasonKey,
            collect,
        });

        expect(result).toMatchObject({ seasons: 1, grades: 1, games: 0 });
        expect(collect).toHaveBeenCalledWith(
            expect.objectContaining({
                store,
                cacheFirst: true,
                games: true,
                years: undefined,
                isFinalBySeasonKey,
            }),
        );

        const listed = await runs.list();
        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
            instanceId: 'job-ok',
            status: 'ok',
            yearsJson: null,
            games: true,
            seasons: 1,
            grades: 1,
            teams: 2,
            results: 2,
            gamesCount: 0,
            warningsJson: '[]',
            errorText: null,
        });
    });

    it('skips when a fresh running row exists', async () => {
        const runs = createImportRunsRepo(createTestDb());
        await runs.insertRunning({
            instanceId: 'already-running',
            startedAt: NOW,
            yearsJson: null,
            games: true,
        });
        const collect = stubCollect();

        const result = await runPlayHqJob({
            params: { years: [2026], games: false },
            store,
            executor: createSqliteExecutor(db),
            cacheFirst: true,
            nowEpochSeconds: NOW,
            instanceId: 'job-skip',
            runs,
            isFinalBySeasonKey,
            collect,
        });

        expect(result).toEqual({ skipped: true });
        expect(collect).not.toHaveBeenCalled();
        const listed = await runs.list();
        expect(listed.map((row) => row.status).toSorted()).toEqual([
            'running',
            'skipped',
        ]);
        expect(
            listed.find((row) => row.instanceId === 'job-skip'),
        ).toMatchObject({
            status: 'skipped',
            yearsJson: '[2026]',
            games: false,
            finishedAt: NOW,
        });
    });

    it('marks a stale running row as error then proceeds', async () => {
        const runs = createImportRunsRepo(createTestDb());
        await runs.insertRunning({
            instanceId: 'stale-run',
            startedAt: NOW - STALE_AFTER_SECONDS - 1,
            yearsJson: null,
            games: true,
        });
        const collect = stubCollect();

        const result = await runPlayHqJob({
            params: { games: true },
            store,
            executor: createSqliteExecutor(db),
            cacheFirst: true,
            nowEpochSeconds: NOW,
            instanceId: 'job-after-stale',
            runs,
            isFinalBySeasonKey,
            collect,
        });

        expect(result).toMatchObject({ seasons: 1 });
        expect(collect).toHaveBeenCalled();
        const listed = await runs.list();
        expect(
            listed.find((row) => row.instanceId === 'stale-run'),
        ).toMatchObject({
            status: 'error',
            errorText: 'stale running row',
            finishedAt: NOW,
        });
        expect(
            listed.find((row) => row.instanceId === 'job-after-stale'),
        ).toMatchObject({ status: 'ok' });
    });

    it('marks error and rethrows when collect throws', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = vi.fn(async (): Promise<CollectedPlayHq> => {
            throw new Error('probe failed');
        });

        await expect(
            runPlayHqJob({
                params: { games: false },
                store,
                executor: createSqliteExecutor(db),
                cacheFirst: true,
                nowEpochSeconds: NOW,
                instanceId: 'job-error',
                runs,
                isFinalBySeasonKey,
                collect,
            }),
        ).rejects.toThrow('probe failed');

        const listed = await runs.list();
        expect(listed[0]).toMatchObject({
            instanceId: 'job-error',
            status: 'error',
            errorText: 'probe failed',
            finishedAt: NOW,
        });
    });

    it('keeps requested years even when the season is not active', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = stubCollect();
        const result = await runPlayHqJob({
            params: { years: [2024], games: false },
            store,
            executor: createSqliteExecutor(db),
            cacheFirst: true,
            nowEpochSeconds: NOW,
            instanceId: 'job-years',
            runs,
            isFinalBySeasonKey,
            collect,
        });

        expect(collect).toHaveBeenCalledWith(
            expect.objectContaining({ years: [2024], games: false }),
        );
        expect(result).toMatchObject({ seasons: 1 });
        const listed = await runs.list();
        expect(listed[0]).toMatchObject({
            status: 'ok',
            yearsJson: '[2024]',
            seasons: 1,
        });
    });
});
