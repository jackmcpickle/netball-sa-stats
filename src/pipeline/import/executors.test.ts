import { describe, expect, it } from 'vitest';
import { createD1Executor } from '@/pipeline/import/executors';

interface FakeStmt {
    all: () => Promise<{ results: Record<string, unknown>[] }>;
}

describe(createD1Executor, () => {
    it('prepares SQL for queryAll and batch', async () => {
        const statements: string[] = [];
        // SAFETY: `createD1Executor` calls only `prepare` and `batch`, both
        // declared below with matching signatures. The full `D1Database`
        // interface is far wider than this test double needs.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a hand-rolled double for a Cloudflare runtime interface: there is no narrower type to keep.
        const fake = {
            async batch(stmts: FakeStmt[]) {
                await Promise.all(stmts.map(async (s) => await s.all()));
            },
            prepare(sql: string) {
                statements.push(sql);
                return {
                    all: async () => ({ results: [{ n: 1 }] }),
                };
            },
        } as unknown as D1Database;

        const executor = createD1Executor(fake);
        await executor.queryAll('SELECT 1 AS n;');
        await executor.batch(['INSERT INTO t DEFAULT VALUES;']);
        expect(statements.length).toBeGreaterThan(0);
    });
});
