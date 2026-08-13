import { describe, expect, it } from 'vitest';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createTestDb } from '@/server/testing/harness';

describe('createImportRunsRepo', () => {
    it('tracks a running import, lists newest first, and clears running on ok', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const olderId = await repo.insertRunning({
            instanceId: 'older',
            startedAt: 100,
            yearsJson: '[2024]',
            games: true,
        });
        await repo.markOk(olderId, 200, {
            seasons: 1,
            grades: 2,
            teams: 3,
            results: 4,
            gamesCount: 5,
            warningsJson: '[]',
        });

        const runningId = await repo.insertRunning({
            instanceId: 'current',
            startedAt: 300,
            yearsJson: '[2025]',
            games: false,
        });

        expect(await repo.hasRunning()).toBe(true);

        const listed = await repo.list();
        expect(listed.map((run) => run.id)).toEqual([runningId, olderId]);
        expect(listed[0]).toMatchObject({
            instanceId: 'current',
            status: 'running',
            games: false,
        });
        expect(listed[1]).toMatchObject({
            instanceId: 'older',
            status: 'ok',
            finishedAt: 200,
            seasons: 1,
            gamesCount: 5,
        });

        await repo.markOk(runningId, 400, {
            seasons: 10,
            grades: 11,
            teams: 12,
            results: 13,
            gamesCount: 14,
            warningsJson: '["warn"]',
        });

        expect(await repo.hasRunning()).toBe(false);
        expect(await repo.list()).toEqual([
            expect.objectContaining({
                id: runningId,
                status: 'ok',
                finishedAt: 400,
                gamesCount: 14,
                warningsJson: '["warn"]',
            }),
            expect.objectContaining({ id: olderId, status: 'ok' }),
        ]);
    });

    it('inserts and marks skipped runs', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const skippedId = await repo.insertSkipped({
            instanceId: 'skipped-on-insert',
            startedAt: 100,
            finishedAt: 101,
            yearsJson: null,
            games: true,
        });

        expect(await repo.hasRunning()).toBe(false);
        expect((await repo.list())[0]).toMatchObject({
            id: skippedId,
            status: 'skipped',
            finishedAt: 101,
        });

        const runningId = await repo.insertRunning({
            instanceId: 'was-running',
            startedAt: 200,
            yearsJson: null,
            games: false,
        });
        await repo.markSkipped(runningId, 201);

        expect(await repo.hasRunning()).toBe(false);
        expect(
            (await repo.list()).find((run) => run.id === runningId),
        ).toMatchObject({
            status: 'skipped',
            finishedAt: 201,
        });
    });

    it('marks error and finds stale running rows', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);

        const staleId = await repo.insertRunning({
            instanceId: 'stale',
            startedAt: 100,
            yearsJson: null,
            games: true,
        });
        await repo.insertRunning({
            instanceId: 'fresh',
            startedAt: 5000,
            yearsJson: null,
            games: true,
        });

        const stale = await repo.runningOlderThan(1000);
        expect(stale.map((run) => run.id)).toEqual([staleId]);

        await repo.markError(staleId, 2000, 'boom');
        expect(await repo.hasRunning()).toBe(true);
        expect(
            (await repo.list()).find((run) => run.id === staleId),
        ).toMatchObject({
            status: 'error',
            finishedAt: 2000,
            errorText: 'boom',
        });
    });
});
