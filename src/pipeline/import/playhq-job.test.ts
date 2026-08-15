import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
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
/** Wall clock when the job finishes: a collect is not instantaneous. */
const FINISHED = NOW + 42;
const STALE_AFTER_SECONDS = 7200;

/** A `team_season_results` CSV row, the shape `CollectedPlayHq.results` holds. */
// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
type ResultCsvRow = {
    grade_key: string;
    club_key: string;
    squad_number: number | null;
    playhq_id: string;
    display_name: string;
    ladder_position: number;
    position_uncertain: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    byes: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    percentage: number;
    shots_attempted: number | null;
    shots_scored: number | null;
    source: string;
    placement_basis: string;
    notes: string | null;
    scraped_at: number;
};

/** One season's worth of collected rows, as `stubCollected` assembles them. */
interface SeasonBundle {
    season: SeasonRow;
    grade: GradeRow;
    teams: TeamRow[];
    results: ResultCsvRow[];
}

function resultRow(
    gradeKey: string,
    clubKey: string,
    playhqId: string,
    displayName: string,
    position: number,
): ResultCsvRow {
    const won = position === 1 ? 8 : 2;
    const lost = position === 1 ? 2 : 8;
    return {
        byes: 0,
        club_key: clubKey,
        display_name: displayName,
        drawn: 0,
        goal_difference: position === 1 ? 100 : -100,
        goals_against: position === 1 ? 400 : 500,
        goals_for: position === 1 ? 500 : 400,
        grade_key: gradeKey,
        ladder_position: position,
        lost,
        notes: null,
        percentage: position === 1 ? 125 : 80,
        placement_basis: 'regular_season_ladder',
        played: 10,
        playhq_id: playhqId,
        points: position === 1 ? 16 : 4,
        position_uncertain: 0,
        scraped_at: 1_700_000_000_000,
        shots_attempted: null,
        shots_scored: null,
        source: 'playhq',
        squad_number: null,
        won,
    };
}

function seasonBundle(
    clubA: string,
    clubB: string,
    startYear: number,
    status: string,
): SeasonBundle {
    const seasonKey = `amnd-winter-${String(startYear)}`;
    const gradeKey = `${seasonKey}-a-grade`;
    const teamA = `team-a-${String(startYear)}-agrade`;
    const teamB = `team-b-${String(startYear)}-agrade`;
    return {
        grade: {
            age_band: 'Senior',
            division: null,
            grade_key: gradeKey,
            name: 'A Grade',
            playhq_id: `grade-${String(startYear)}`,
            season_key: seasonKey,
            team_count: 2,
            tier: 4,
        },
        results: [
            resultRow(gradeKey, clubA, teamA, 'Fixture Club A', 1),
            resultRow(gradeKey, clubB, teamB, 'Fixture Club B', 2),
        ],
        season: {
            competition_key: 'amnd',
            competition_period: 'winter',
            end_year: startYear,
            is_final: 0,
            label: `Winter ${String(startYear)}`,
            playhq_id: `season-${String(startYear)}`,
            season_key: seasonKey,
            source: 'playhq',
            start_year: startYear,
            status,
        },
        teams: [
            {
                club_key: clubA,
                display_name: 'Fixture Club A',
                grade_key: gradeKey,
                playhq_id: teamA,
                squad_number: null,
            },
            {
                club_key: clubB,
                display_name: 'Fixture Club B',
                grade_key: gradeKey,
                playhq_id: teamB,
                squad_number: null,
            },
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
        gamesByYear: new Map(),
        grades,
        importData: toImportData({
            aliases: clubRegistry.getAliases(),
            clubs: clubRegistry.getClubs(),
            games: [],
            grades,
            results,
            seasons,
            teams,
        }),
        report: {
            games: 0,
            grades: grades.length,
            results: results.length,
            seasons: seasons.length,
            skippedGrades: [],
            teams: teams.length,
        },
        results,
        seasons,
        teams,
    };
}

/** `stubCollected` resolves both clubs against an empty database. */
const NEW_CLUB_WARNINGS = [
    'warning: new club fixture-club-a (Fixture Club A, playhq_id=org-club-a) — curate later',
    'warning: new club fixture-club-b (Fixture Club B, playhq_id=org-club-b) — curate later',
];

function stubCollect(): Mock<
    (options: CollectOptions) => Promise<CollectedPlayHq>
> {
    return vi.fn<(options: CollectOptions) => Promise<CollectedPlayHq>>(
        async (options: CollectOptions): Promise<CollectedPlayHq> =>
            stubCollected(options.clubRegistry),
    );
}

describe(runPlayHqJob, () => {
    let db: DatabaseSync;
    const store = createMemoryStore();
    const isFinalBySeasonKey = new Map<string, string>();

    beforeEach(async () => {
        db = await createMigratedDb();
        vi.spyOn(Date, 'now').mockReturnValue(FINISHED * 1000);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        db.close();
    });

    it('imports via injected collect and records an ok import_runs row', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = stubCollect();
        const result = await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-ok',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: true },
            runs,
            store,
        });

        expect(result).toMatchObject({ games: 0, grades: 1, seasons: 1 });
        expect(collect).toHaveBeenCalledWith(
            expect.objectContaining({
                cacheFirst: true,
                games: true,
                isFinalBySeasonKey,
                store,
                years: undefined,
            }),
        );

        const listed = await runs.list();
        expect(listed).toHaveLength(1);
        expect(listed[0]).toMatchObject({
            errorText: null,
            games: true,
            gamesCount: 0,
            grades: 1,
            instanceId: 'job-ok',
            results: 2,
            seasons: 1,
            status: 'ok',
            teams: 2,
            warningsJson: JSON.stringify(NEW_CLUB_WARNINGS),
            yearsJson: null,
        });
    });

    it('warns about skipped grades alongside newly minted clubs', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = vi.fn<
            (options: CollectOptions) => Promise<CollectedPlayHq>
        >(async (options: CollectOptions): Promise<CollectedPlayHq> => {
            const collected = stubCollected(options.clubRegistry);
            return {
                ...collected,
                report: {
                    ...collected.report,
                    skippedGrades: [
                        {
                            gradeName: 'C Grade',
                            reason: 'too_few_teams',
                            seasonKey: 'amnd-winter-2026',
                            teamCount: 1,
                        },
                        {
                            gradeName: 'Walking Netball 50+',
                            reason: 'out_of_scope',
                            seasonKey: 'season-id',
                            teamCount: -1,
                        },
                    ],
                },
            };
        });

        await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-warnings',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: false },
            runs,
            store,
        });

        const listed = await runs.list();
        expect(JSON.parse(listed[0].warningsJson ?? '[]')).toStrictEqual([
            'warning: skipped grade amnd-winter-2026 / C Grade — too_few_teams (1 team(s))',
            'warning: skipped grade season-id / Walking Netball 50+ — out_of_scope (not a catalogued competition)',
            ...NEW_CLUB_WARNINGS,
        ]);
    });

    it('skips when a fresh running row exists', async () => {
        const runs = createImportRunsRepo(createTestDb());
        await runs.insertRunning({
            games: true,
            instanceId: 'already-running',
            startedAt: NOW,
            yearsJson: null,
        });
        const collect = stubCollect();

        const result = await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-skip',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: false, years: [2026] },
            runs,
            store,
        });

        expect(result).toStrictEqual({ skipped: true });
        expect(collect).not.toHaveBeenCalled();
        const listed = await runs.list();
        expect(listed.map((row) => row.status).toSorted()).toStrictEqual([
            'running',
            'skipped',
        ]);
        expect(
            listed.find((row) => row.instanceId === 'job-skip'),
        ).toMatchObject({
            finishedAt: FINISHED,
            games: false,
            status: 'skipped',
            yearsJson: '[2026]',
        });
    });

    it('marks a stale running row as error then proceeds', async () => {
        const runs = createImportRunsRepo(createTestDb());
        await runs.insertRunning({
            games: true,
            instanceId: 'stale-run',
            startedAt: NOW - STALE_AFTER_SECONDS - 1,
            yearsJson: null,
        });
        const collect = stubCollect();

        const result = await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-after-stale',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: true },
            runs,
            store,
        });

        expect(result).toMatchObject({ seasons: 1 });
        expect(collect).toHaveBeenCalledOnce();
        const listed = await runs.list();
        expect(
            listed.find((row) => row.instanceId === 'stale-run'),
        ).toMatchObject({
            errorText: 'stale running row',
            finishedAt: FINISHED,
            status: 'error',
        });
        expect(
            listed.find((row) => row.instanceId === 'job-after-stale'),
        ).toMatchObject({ status: 'ok' });
    });

    it('skips when a stale running row sits beside a fresh one', async () => {
        const runs = createImportRunsRepo(createTestDb());
        await runs.insertRunning({
            games: true,
            instanceId: 'stale-run',
            startedAt: NOW - STALE_AFTER_SECONDS - 1,
            yearsJson: null,
        });
        await runs.insertRunning({
            games: true,
            instanceId: 'fresh-run',
            startedAt: NOW - 60,
            yearsJson: null,
        });
        const collect = stubCollect();

        const result = await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-stale-plus-fresh',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: true },
            runs,
            store,
        });

        expect(result).toStrictEqual({ skipped: true });
        expect(collect).not.toHaveBeenCalled();
        const listed = await runs.list();
        expect(
            listed.find((row) => row.instanceId === 'job-stale-plus-fresh'),
        ).toMatchObject({ finishedAt: FINISHED, status: 'skipped' });
        // The fresh row still owns the lock, so the stale one is left alone
        // rather than reaped as cover for a second concurrent import.
        expect(
            listed
                .filter((row) => row.status === 'running')
                .map((row) => row.instanceId),
        ).toStrictEqual(['fresh-run', 'stale-run']);
    });

    it('marks error and rethrows when collect throws', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = vi.fn<() => Promise<CollectedPlayHq>>(async () => {
            throw new Error('probe failed');
        });

        await expect(
            runPlayHqJob({
                cacheFirst: true,
                collect,
                executor: createSqliteExecutor(db),
                instanceId: 'job-error',
                isFinalBySeasonKey,
                nowEpochSeconds: NOW,
                params: { games: false },
                runs,
                store,
            }),
        ).rejects.toThrow('probe failed');

        const listed = await runs.list();
        expect(listed[0]).toMatchObject({
            errorText: 'probe failed',
            finishedAt: FINISHED,
            instanceId: 'job-error',
            status: 'error',
        });
    });

    it('keeps requested years even when the season is not active', async () => {
        const runs = createImportRunsRepo(createTestDb());
        const collect = stubCollect();
        const result = await runPlayHqJob({
            cacheFirst: true,
            collect,
            executor: createSqliteExecutor(db),
            instanceId: 'job-years',
            isFinalBySeasonKey,
            nowEpochSeconds: NOW,
            params: { games: false, years: [2024] },
            runs,
            store,
        });

        expect(collect).toHaveBeenCalledWith(
            expect.objectContaining({ games: false, years: [2024] }),
        );
        expect(result).toMatchObject({ seasons: 1 });
        const listed = await runs.list();
        expect(listed[0]).toMatchObject({
            seasons: 1,
            status: 'ok',
            yearsJson: '[2024]',
        });
    });
});
