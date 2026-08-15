import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importRuns } from '@/db/schema';
import { createServices } from '@/server/container';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createAdminService } from '@/server/services/admin.service';
import type { StartImport } from '@/server/services/admin.service';
import { createTestDb } from '@/server/testing/harness';

function startedLabel(epochSeconds: number): string {
    return new Intl.DateTimeFormat('en-AU', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Australia/Adelaide',
    }).format(new Date(epochSeconds * 1000));
}

describe('createAdminService.getPage', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns an empty dashboard when there are no runs', async () => {
        const db = createTestDb();
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const page = await admin.getPage();

        expect(page).toStrictEqual({
            lastStatus: null,
            running: false,
            runningElapsedLabel: null,
            runs: [],
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('maps a running row and an ok row onto the page DTO', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(1_700_000_000 * 1000));

        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        const okId = await repo.insertRunning({
            games: true,
            instanceId: 'ok-run',
            startedAt: 1_700_000_000 - 3900,
            yearsJson: '[2025]',
        });
        await repo.markOk(okId, 1_700_000_000 - 3600, {
            gamesCount: 80,
            grades: 12,
            results: 40,
            seasons: 3,
            teams: 40,
            warningsJson: '["new club: example"]',
        });
        const runningId = await repo.insertRunning({
            games: true,
            instanceId: 'running-run',
            startedAt: 1_700_000_000 - 12 * 60,
            yearsJson: null,
        });

        const admin = createAdminService(repo, {
            startImport: vi.fn<StartImport>(async () => {}),
        });
        const page = await admin.getPage();

        expect(page.running).toBeTruthy();
        expect(page.runningElapsedLabel).toBe('12m');
        expect(page.lastStatus).toBe('running');
        expect(page.runs).toHaveLength(2);
        expect(page.runs[0]).toMatchObject({
            durationLabel: '12m',
            errorText: null,
            gamesCount: null,
            grades: null,
            id: runningId,
            seasons: null,
            startedLabel: startedLabel(1_700_000_000 - 12 * 60),
            status: 'running',
            warningCount: 0,
            warnings: [],
        });
        expect(page.runs[1]).toMatchObject({
            durationLabel: '5m',
            errorText: null,
            gamesCount: 80,
            grades: 12,
            id: okId,
            seasons: 3,
            startedLabel: startedLabel(1_700_000_000 - 3900),
            status: 'ok',
            warningCount: 1,
            warnings: ['new club: example'],
        });
    });

    it('uses an em dash when a finished timestamp is missing', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        const id = await repo.insertRunning({
            games: false,
            instanceId: 'errored-without-finish',
            startedAt: 100,
            yearsJson: null,
        });
        await repo.markError(id, 200, 'boom');
        // Simulate a crashed row that lost its finished timestamp. Written
        // straight to the table: the repo contract has no way to express it.
        await db
            .update(importRuns)
            .set({ finishedAt: null })
            .where(eq(importRuns.id, id));

        const admin = createAdminService(repo, {
            startImport: vi.fn<StartImport>(async () => {}),
        });
        const page = await admin.getPage();

        expect(page.runs[0]).toMatchObject({
            durationLabel: '—',
            errorText: 'boom',
            status: 'error',
        });
    });

    it('formats durations as hours and minutes and treats invalid warnings as empty', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        const id = await repo.insertRunning({
            games: true,
            instanceId: 'long-ok',
            startedAt: 1000,
            yearsJson: null,
        });
        await repo.markOk(id, 1000 + 3600 + 5 * 60, {
            gamesCount: 1,
            grades: 1,
            results: 1,
            seasons: 1,
            teams: 1,
            warningsJson: '{not json',
        });

        const admin = createAdminService(repo, {
            startImport: vi.fn<StartImport>(async () => {}),
        });
        const page = await admin.getPage();

        expect(page.runs[0]).toMatchObject({
            durationLabel: '1h 5m',
            warningCount: 0,
            warnings: [],
        });
    });
});

describe('createAdminService.runImport', () => {
    it('refuses while a run is in progress and does not call startImport', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        await repo.insertRunning({
            games: true,
            instanceId: 'lock',
            startedAt: 50,
            yearsJson: null,
        });
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(repo, { startImport });

        const result = await admin.runImport(' ');

        expect(result).toStrictEqual({
            error: { kind: 'already-running' },
            ok: false,
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('rejects non-year tokens as bad-years', async () => {
        const db = createTestDb();
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('2026, potato');

        expect(result).toStrictEqual({
            error: { kind: 'bad-years' },
            ok: false,
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('starts a games-only import when years text is empty', async () => {
        const db = createTestDb();
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('');

        expect(result).toStrictEqual({ ok: true, value: true });
        expect(startImport).toHaveBeenCalledExactlyOnceWith({ games: true });
    });

    it('parses a single year into the startImport params', async () => {
        const db = createTestDb();
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('2026');

        expect(result).toStrictEqual({ ok: true, value: true });
        expect(startImport).toHaveBeenCalledWith({
            games: true,
            years: [2026],
        });
    });

    it('trims tokens and treats whitespace-only years as games-only', async () => {
        const db = createTestDb();
        const startImport = vi.fn<StartImport>(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        await expect(admin.runImport('  ')).resolves.toStrictEqual({
            ok: true,
            value: true,
        });
        expect(startImport).toHaveBeenCalledWith({ games: true });

        startImport.mockClear();
        await expect(admin.runImport(' 2026 , 2025 ')).resolves.toStrictEqual({
            ok: true,
            value: true,
        });
        expect(startImport).toHaveBeenCalledWith({
            games: true,
            years: [2026, 2025],
        });
    });
});

describe('admin auth isolation', () => {
    it('does not call getPage from auth helpers', () => {
        const source = readFileSync(
            resolve(import.meta.dirname, '../admin-auth.ts'),
            'utf-8',
        );
        expect(source).not.toContain('createImportRunsRepo');
        expect(source).not.toContain('getPage');
        expect(source).not.toContain('admin.service');
    });

    it('does not import cloudflare:workers from the admin service', () => {
        const source = readFileSync(
            resolve(import.meta.dirname, './admin.service.ts'),
            'utf-8',
        );
        expect(source).not.toContain('cloudflare:workers');
    });
});

describe('createServices admin wiring', () => {
    it('still works with one argument and defaults startImport', async () => {
        const db = createTestDb();
        const page = await createServices(db).admin.getPage();
        expect(page.runs).toStrictEqual([]);

        await expect(createServices(db).admin.runImport('')).rejects.toThrow(
            'PLAYHQ_IMPORT is not bound',
        );
    });
});
