import { env } from 'cloudflare:workers';
import type { PlayHqJobParams } from '@/pipeline/import/playhq-job';

export async function startPlayHqImport(
    params: PlayHqJobParams,
): Promise<void> {
    await env.PLAYHQ_IMPORT.create({ params });
}
