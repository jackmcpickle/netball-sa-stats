import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServices } from '@/server/container';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';
import { createAdminService } from '@/server/services/admin.service';
import { createTestDb } from '@/server/testing/harness';

afterEach(() => {
    vi.useRealTimers();
});

function startedLabel(epochSeconds: number): string {
    return new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Adelaide',
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(epochSeconds * 1000));
}

describe('createAdminService.getPage', () => {
    it('returns an empty dashboard when there are no runs', async () => {
        const db = createTestDb();
        const startImport = vi.fn(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const page = await admin.getPage();

        expect(page).toStrictEqual({
            running: false,
            runningElapsedLabel: null,
            lastStatus: null,
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
            instanceId: 'ok-run',
            startedAt: 1_700_000_000 - 3900,
            yearsJson: '[2025]',
            games: true,
        });
        await repo.markOk(okId, 1_700_000_000 - 3600, {
            seasons: 3,
            grades: 12,
            teams: 40,
            results: 40,
            gamesCount: 80,
            warningsJson: '["new club: example"]',
        });
        const runningId = await repo.insertRunning({
            instanceId: 'running-run',
            startedAt: 1_700_000_000 - 12 * 60,
            yearsJson: null,
            games: true,
        });

        const admin = createAdminService(repo, {
            startImport: vi.fn(async () => {}),
        });
        const page = await admin.getPage();

        expect(page.running).toBeTruthy();
        expect(page.runningElapsedLabel).toBe('12m');
        expect(page.lastStatus).toBe('running');
        expect(page.runs).toHaveLength(2);
        expect(page.runs[0]).toMatchObject({
            id: runningId,
            startedLabel: startedLabel(1_700_000_000 - 12 * 60),
            status: 'running',
            seasons: null,
            grades: null,
            gamesCount: null,
            warningCount: 0,
            durationLabel: '12m',
            errorText: null,
            warnings: [],
        });
        expect(page.runs[1]).toMatchObject({
            id: okId,
            startedLabel: startedLabel(1_700_000_000 - 3900),
            status: 'ok',
            seasons: 3,
            grades: 12,
            gamesCount: 80,
            warningCount: 1,
            durationLabel: '5m',
            errorText: null,
            warnings: ['new club: example'],
        });
    });

    it('uses an em dash when a finished timestamp is missing', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        const id = await repo.insertRunning({
            instanceId: 'errored-without-finish',
            startedAt: 100,
            yearsJson: null,
            games: false,
        });
        await repo.markError(id, 200, 'boom');
        // Simulate a crashed row that lost its finished timestamp.
        await repo.markError(id, null as unknown as number, 'boom');

        const admin = createAdminService(repo, {
            startImport: vi.fn(async () => {}),
        });
        const page = await admin.getPage();

        expect(page.runs[0]).toMatchObject({
            status: 'error',
            durationLabel: '—',
            errorText: 'boom',
        });
    });

    it('formats durations as hours and minutes and treats invalid warnings as empty', async () => {
        const db = createTestDb();
        const repo = createImportRunsRepo(db);
        const id = await repo.insertRunning({
            instanceId: 'long-ok',
            startedAt: 1000,
            yearsJson: null,
            games: true,
        });
        await repo.markOk(id, 1000 + 3600 + 5 * 60, {
            seasons: 1,
            grades: 1,
            teams: 1,
            results: 1,
            gamesCount: 1,
            warningsJson: '{not json',
        });

        const admin = createAdminService(repo, {
            startImport: vi.fn(async () => {}),
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
            instanceId: 'lock',
            startedAt: 50,
            yearsJson: null,
            games: true,
        });
        const startImport = vi.fn(async () => {});
        const admin = createAdminService(repo, { startImport });

        const result = await admin.runImport(' ');

        expect(result).toStrictEqual({
            ok: false,
            error: { kind: 'already-running' },
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('rejects non-year tokens as bad-years', async () => {
        const db = createTestDb();
        const startImport = vi.fn(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('2026, potato');

        expect(result).toStrictEqual({
            ok: false,
            error: { kind: 'bad-years' },
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('starts a games-only import when years text is empty', async () => {
        const db = createTestDb();
        const startImport = vi.fn(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('');

        expect(result).toStrictEqual({ ok: true, value: true });
        expect(startImport).toHaveBeenCalledOnce();
        expect(startImport).toHaveBeenCalledWith({ games: true });
    });

    it('parses a single year into the startImport params', async () => {
        const db = createTestDb();
        const startImport = vi.fn(async () => {});
        const admin = createAdminService(createImportRunsRepo(db), {
            startImport,
        });

        const result = await admin.runImport('2026');

        expect(result).toStrictEqual({ ok: true, value: true });
        expect(startImport).toHaveBeenCalledWith({
            years: [2026],
            games: true,
        });
    });

    it('trims tokens and treats whitespace-only years as games-only', async () => {
        const db = createTestDb();
        const startImport = vi.fn(async () => {});
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
            years: [2026, 2025],
            games: true,
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
