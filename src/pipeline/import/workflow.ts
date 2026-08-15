import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- drizzle's `{ schema }` option takes the whole table namespace; naming each table here would drift silently.
import * as schema from '@/db/schema';
import { createR2Store } from '@/pipeline/fetch/r2-store';
import { createD1Executor } from '@/pipeline/import/d1-executor';
import { loadIsFinalMap, runPlayHqJob } from '@/pipeline/import/playhq-job';
import type { PlayHqJobParams } from '@/pipeline/import/playhq-job';
import { createImportRunsRepo } from '@/server/repos/import-runs.repo';

export class PlayHqImportWorkflow extends WorkflowEntrypoint<
    Env,
    PlayHqJobParams
> {
    public async run(
        event: WorkflowEvent<PlayHqJobParams>,
        step: WorkflowStep,
    ): Promise<void> {
        const payload = event.payload ?? { games: true };
        const params: PlayHqJobParams = {
            games: payload.games ?? true,
            years: payload.years,
        };
        const { instanceId } = event;
        await step.do(
            'lock-and-import',
            {
                retries: {
                    limit: 0,
                    delay: '10 seconds',
                    backoff: 'constant',
                },
            },
            async () => {
                const executor = createD1Executor(this.env.DB);
                const db = drizzle(this.env.DB, {
                    schema,
                    casing: 'snake_case',
                });
                const result = await runPlayHqJob({
                    params,
                    store: createR2Store(this.env.PLAYHQ_RAW),
                    executor,
                    cacheFirst: false,
                    nowEpochSeconds: Math.floor(Date.now() / 1000),
                    instanceId,
                    runs: createImportRunsRepo(db),
                    isFinalBySeasonKey: await loadIsFinalMap(executor),
                });
                if ('skipped' in result) {
                    return { skipped: true };
                }
                return {
                    seasons: result.seasons,
                    grades: result.grades,
                    teams: result.teams,
                    results: result.results,
                    games: result.games,
                };
            },
        );
    }
}
