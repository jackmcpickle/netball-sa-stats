import serverEntry from '@tanstack/react-start/server-entry';
import { getDb } from '@/db';
import { startPlayHqImport } from '@/pipeline/import/start-import';
import { createServices } from '@/server/container';

export { PlayHqImportWorkflow } from '@/pipeline/import/workflow';

/**
 * The cron runs the same path as the admin button, so the `already-running`
 * guard in `AdminService.runImport` stops a slow import from being started
 * twice. Empty years means "PlayHQ's active seasons only".
 */
async function runScheduledImport(): Promise<void> {
    const services = createServices(getDb(), {
        startImport: startPlayHqImport,
    });
    const started = await services.admin.runImport('');
    if (!started.ok) {
        console.warn('scheduled playhq import skipped', started.error.kind);
    }
}

export default {
    ...serverEntry,
    /** `serverEntry.fetch` has its own richer signature, so no `satisfies`. */
    scheduled(
        _controller: ScheduledController,
        _env: Env,
        ctx: ExecutionContext,
    ): void {
        ctx.waitUntil(runScheduledImport());
    },
};
