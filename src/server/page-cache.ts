import { cache } from 'cloudflare:workers';
import type { PurgeCacheResult } from '@/server/services/admin.service';

/**
 * Workers Cache (`cache.enabled` in wrangler.jsonc) keeps a page without a
 * `Cache-Control` header for two hours. A purge only reaches the entrypoint
 * that issues it, so this must run from a fetch request, not the workflow.
 */
export async function purgePageCache(): Promise<PurgeCacheResult> {
    return await cache.purge({ purgeEverything: true });
}
