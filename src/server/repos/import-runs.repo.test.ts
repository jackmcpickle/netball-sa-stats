import { describe, expect, it } from 'vitest';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createTestDb } from '@/server/testing/harness';

describe(createImportRunsRepo, () => {
    it('tracks a running import, lists newest first, and clears running on ok', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const olderId = await repo.insertRunning({
            games: true,
            instanceId: 'older',
            startedAt: 100,
            yearsJson: '[2024]',
        });
        await repo.markOk(olderId, 200, {
            gamesCount: 5,
            grades: 2,
            results: 4,
            seasons: 1,
            teams: 3,
            warningsJson: '[]',
        });

        const runningId = await repo.insertRunning({
            games: false,
            instanceId: 'current',
            startedAt: 300,
            yearsJson: '[2025]',
        });

        await expect(repo.hasRunning()).resolves.toBeTruthy();

        const listed = await repo.list();
        expect(listed.map((run) => run.id)).toStrictEqual([runningId, olderId]);
        expect(listed[0]).toMatchObject({
            games: false,
            instanceId: 'current',
            status: 'running',
        });
        expect(listed[1]).toMatchObject({
            finishedAt: 200,
            gamesCount: 5,
            instanceId: 'older',
            seasons: 1,
            status: 'ok',
        });

        await repo.markOk(runningId, 400, {
            gamesCount: 14,
            grades: 11,
            results: 13,
            seasons: 10,
            teams: 12,
            warningsJson: '["warn"]',
        });

        await expect(repo.hasRunning()).resolves.toBeFalsy();
        await expect(repo.list()).resolves.toStrictEqual([
            expect.objectContaining({
                finishedAt: 400,
                gamesCount: 14,
                id: runningId,
                status: 'ok',
                warningsJson: '["warn"]',
            }),
            expect.objectContaining({ id: olderId, status: 'ok' }),
        ]);
    });

    it('inserts and marks skipped runs', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const skippedId = await repo.insertSkipped({
            finishedAt: 101,
            games: true,
            instanceId: 'skipped-on-insert',
            startedAt: 100,
            yearsJson: null,
        });

        await expect(repo.hasRunning()).resolves.toBeFalsy();
        const [afterSkipped] = await repo.list();
        expect(afterSkipped).toMatchObject({
            finishedAt: 101,
            id: skippedId,
            status: 'skipped',
        });

        const runningId = await repo.insertRunning({
            games: false,
            instanceId: 'was-running',
            startedAt: 200,
            yearsJson: null,
        });
        await repo.markSkipped(runningId, 201);

        await expect(repo.hasRunning()).resolves.toBeFalsy();
        const afterMarkSkipped = await repo.list();
        expect(
            afterMarkSkipped.find((run) => run.id === runningId),
        ).toMatchObject({
            finishedAt: 201,
            status: 'skipped',
        });
    });

    it('marks error and finds stale running rows', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const staleId = await repo.insertRunning({
            games: true,
            instanceId: 'stale',
            startedAt: 100,
            yearsJson: null,
        });
        await repo.insertRunning({
            games: true,
            instanceId: 'fresh',
            startedAt: 5000,
            yearsJson: null,
        });

        const stale = await repo.runningOlderThan(1000);
        expect(stale.map((run) => run.id)).toStrictEqual([staleId]);
        await expect(repo.hasRunningSince(1000)).resolves.toBeTruthy();
        await expect(repo.hasRunningSince(6000)).resolves.toBeFalsy();

        await repo.markError(staleId, 2000, 'boom');
        await expect(repo.hasRunning()).resolves.toBeTruthy();
        const afterMarkError = await repo.list();
        expect(afterMarkError.find((run) => run.id === staleId)).toMatchObject({
            errorText: 'boom',
            finishedAt: 2000,
            status: 'error',
        });
    });
});
