import { describe, expect, it } from 'vitest';
import { createD1Executor } from '@/pipeline/import/executors';

type FakeStmt = { all: () => Promise<{ results: Record<string, unknown>[] }> };

describe('createD1Executor', () => {
    it('prepares SQL for queryAll and batch', async () => {
        const statements: string[] = [];
        const fake = {
            prepare(sql: string) {
                statements.push(sql);
                return {
                    all: async () => ({ results: [{ n: 1 }] }),
                };
            },
            async batch(stmts: FakeStmt[]) {
                await Promise.all(stmts.map(async (s) => s.all()));
            },
        } as unknown as D1Database;

        const executor = createD1Executor(fake);
        await executor.queryAll('SELECT 1 AS n;');
        await executor.batch(['INSERT INTO t DEFAULT VALUES;']);
        expect(statements.length).toBeGreaterThan(0);
    });
});
