# PlayHQ Automated Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run PlayHQ fetch+import on a Cloudflare Workflow every Sunday, persist raw captures in R2 and rows in D1, and show the results behind a password-gated `/admin` page.

**Architecture:** Keep the existing two-stage pipeline. Inject a `CaptureStore` so fetch is not tied to `node:fs`. Add `runImportData` so import is not tied to CSV-on-disk or whole-table row counts. A `PlayHqImportWorkflow` on the same Worker as TanStack Start orchestrates serial GraphQL → R2 → validate → D1. `/admin` reads `import_runs` and can start a run.

**Tech Stack:** Vite+ (`vp check`, `vp test`), existing `src/pipeline` + DDD `src/server`, Drizzle/D1, Cloudflare Workflows + R2, TanStack Start routes, Web Crypto.

## Global Constraints

- Validate with `vp check` and `vp test`. Never invoke `npm`/`vitest` directly.
- **~1 req/sec** to `api.playhq.com`. Do not `Promise.all` PlayHQ calls.
- Query strings in `QUERIES` stay **verbatim** from `docs/playhq-api.md`. Do not hand-edit them.
- **Idempotent upserts.** `generateImportSql` already `ON CONFLICT`s. Do not invent teams.
- **Validate before write.** `ImportValidationError` aborts the D1 projection.
- `competitions` / `grade_weights` stay migration-owned.
- Cron (when enabled) imports every catalogued season PlayHQ marks `ACTIVE`. Manual `/admin` may pass `years` to freeze a completed season.
- Git CSV remains the rebuildable archive. Do not rewrite `data/*.csv` from the Worker.
- Do **not** put `schedules` in `wrangler.jsonc` until Task 9’s Worker-isolate spike passes.
- No `Admin` item in `SiteHeader` `NAV`. No public Sync button.
- Secrets via `wrangler secret put` only — never in `wrangler.jsonc` or source.
- Password checks use `crypto.subtle.timingSafeEqual` on equal-length HMAC digests, never `===`.
- No bitwise operators (existing lint). Keep functions under the existing length budget — split rather than grow `run.ts`.
- Do not add `@cloudflare/vitest-pool-workers`. Pipeline and admin tests stay in the existing Node/jsdom Vitest pool. Workflow class is a thin `step.do` wrapper around functions tested in Node.

## File Structure

| File                                                | Responsibility                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `src/pipeline/fetch/capture-store.ts`               | `CaptureStore` type, `createMemoryStore`, `createFsStore`.          |
| `src/pipeline/fetch/playhq-client.ts`               | GraphQL + cache via `CaptureStore`; no `node:fs`.                   |
| `src/pipeline/fetch/run.ts`                         | Collect PlayHQ rows in memory; CLI still writes CSV.                |
| `src/pipeline/fetch/to-import.ts`                   | Fetch row types → `ImportData`.                                     |
| `src/pipeline/import/run.ts`                        | `runImportData(data, executor, { counts })`.                        |
| `src/pipeline/import/executors.ts`                  | `createD1Executor`.                                                 |
| `src/db/schema.ts` + `drizzle/0008_import_runs.sql` | `import_runs` table.                                                |
| `src/server/admin-auth.ts`                          | Password HMAC + cookie sign/verify.                                 |
| `src/server/repos/import-runs.repo.ts`              | D1 access for runs.                                                 |
| `src/server/services/admin.service.ts`              | Page DTO + start-import gate.                                       |
| `src/server/dto/admin.dto.ts`                       | Wire shapes for `/admin`.                                           |
| `src/components/admin/admin-page.tsx`               | Status strip, table, run form, sign out.                            |
| `src/components/admin/admin-login-page.tsx`         | Password form.                                                      |
| `src/routes/admin.tsx`                              | Layout + session `beforeLoad`.                                      |
| `src/routes/admin.index.tsx`                        | Authenticated dashboard.                                            |
| `src/routes/admin.login.tsx`                        | Login (cookie not required).                                        |
| `src/pipeline/import/playhq-job.ts`                 | Worker/CLI-agnostic job: lock → fetch → validate → upsert → record. |
| `src/pipeline/fetch/r2-store.ts`                    | R2 `CaptureStore`.                                                  |
| `src/pipeline/import/workflow.ts`                   | `PlayHqImportWorkflow` wrapping `playhq-job`.                       |
| `src/worker.ts`                                     | Re-export Start `fetch` + Workflow class.                           |
| `wrangler.jsonc`                                    | R2 + Workflow bindings; `schedules` only in Task 9.                 |
| `docs/deployment.md`, `PLAN.md`                     | Secrets, R2, admin, revised no-Worker-sync.                         |

---

### Task 1: CaptureStore + GraphQL client

**Files:**

- Create: `src/pipeline/fetch/capture-store.ts`
- Create: `src/pipeline/fetch/capture-store.test.ts`
- Create: `src/pipeline/fetch/playhq-client.test.ts`
- Modify: `src/pipeline/fetch/playhq-client.ts` (remove `node:fs`; take a store)
- Modify: `src/pipeline/fetch/run.ts` (pass `createFsStore(RAW_DIR)` into `cachedGraphQL`)
- Modify: `src/pipeline/fetch/captured-at.ts` only if the fs store needs it — prefer calling `recordCapture` / `capturedAt` from `createFsStore`, not from the client

**Interfaces:**

- Consumes: existing `recordCapture` / `capturedAt` for the fs adapter
- Produces:

```ts
export type CaptureStore = {
    get(key: string): Promise<unknown | undefined>;
    put(key: string, data: unknown, capturedAtMs: number): Promise<void>;
    capturedAtMs(key: string): Promise<number | undefined>;
};

export function createMemoryStore(
    seed?: ReadonlyMap<string, { data: unknown; capturedAtMs: number }>,
): CaptureStore;

export function createFsStore(rawDir: string): CaptureStore;

export async function cachedGraphQL(
    store: CaptureStore,
    key: string,
    operationName: QueryName,
    variables: Record<string, string>,
    cacheFirst: boolean,
): Promise<unknown>;
```

`key` is the current filename (`gradeLadder_<id>.json`), not an absolute path.

- [ ] **Step 1: Write the failing store tests**

```ts
// src/pipeline/fetch/capture-store.test.ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createFsStore,
    createMemoryStore,
} from '@/pipeline/fetch/capture-store';

describe('createMemoryStore', () => {
    it('returns undefined for a missing key', async () => {
        expect(
            await createMemoryStore().get('gradeLadder_x.json'),
        ).toBeUndefined();
    });

    it('round-trips put/get and capturedAtMs', async () => {
        const store = createMemoryStore();
        await store.put('gradeLadder_x.json', { data: 1 }, 1_700_000_000_000);
        expect(await store.get('gradeLadder_x.json')).toEqual({ data: 1 });
        expect(await store.capturedAtMs('gradeLadder_x.json')).toBe(
            1_700_000_000_000,
        );
    });
});

describe('createFsStore', () => {
    it('round-trips via files and the captured-at manifest', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'capture-store-'));
        const store = createFsStore(dir);
        await store.put('gradeLadder_x.json', { ok: true }, 1_700_000_000_000);
        expect(await store.get('gradeLadder_x.json')).toEqual({ ok: true });
        expect(await store.capturedAtMs('gradeLadder_x.json')).toBe(
            1_700_000_000_000,
        );
    });
});
```

- [ ] **Step 2: Run the tests — they must fail**

Run: `vp test src/pipeline/fetch/capture-store.test.ts`

Expected: FAIL, module not found.

- [ ] **Step 3: Implement `capture-store.ts`**

Memory: a `Map<string, { data: unknown; capturedAtMs: number }>`.

Fs: `get` reads `join(rawDir, key)` as JSON, missing file → `undefined`. `put` writes pretty JSON (4-space, trailing newline — match current `writeCache`) then `recordCapture(join(rawDir, key), capturedAtMs)`. `capturedAtMs` calls `capturedAt` and returns it.

- [ ] **Step 4: Write the failing client test**

```ts
// src/pipeline/fetch/playhq-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '@/pipeline/fetch/capture-store';
import { cachedGraphQL } from '@/pipeline/fetch/playhq-client';

describe('cachedGraphQL', () => {
    it('returns the store hit when cacheFirst is true and does not fetch', async () => {
        const store = createMemoryStore(
            new Map([
                [
                    'discoverCompetitions_abc.json',
                    { data: { cached: true }, capturedAtMs: 1 },
                ],
            ]),
        );
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const result = await cachedGraphQL(
            store,
            'discoverCompetitions_abc.json',
            'discoverCompetitions',
            { organisationID: 'abc' },
            true,
        );
        expect(result).toEqual({ cached: true });
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('fetches and puts when cacheFirst is false even if the store has a hit', async () => {
        const store = createMemoryStore(
            new Map([
                [
                    'discoverCompetitions_abc.json',
                    { data: { cached: true }, capturedAtMs: 1 },
                ],
            ]),
        );
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ data: { fresh: true } }), {
                status: 200,
            }),
        );
        const result = await cachedGraphQL(
            store,
            'discoverCompetitions_abc.json',
            'discoverCompetitions',
            { organisationID: 'abc' },
            false,
        );
        expect(result).toEqual({ data: { fresh: true } });
        expect(await store.get('discoverCompetitions_abc.json')).toEqual({
            data: { fresh: true },
        });
        vi.restoreAllMocks();
    });
});
```

- [ ] **Step 5: Change `cachedGraphQL` to the new signature and drop `node:fs`**

Keep `requestGraphQL` / rate limit / retries as they are. `cachedGraphQL` becomes:

```ts
export async function cachedGraphQL(
    store: CaptureStore,
    key: string,
    operationName: QueryName,
    variables: Record<string, string>,
    cacheFirst: boolean,
): Promise<unknown> {
    if (cacheFirst) {
        const cached = await store.get(key);
        if (cached !== undefined) return cached;
    }
    const result = await requestGraphQL(operationName, variables);
    await store.put(key, result, Date.now());
    return result;
}
```

In `run.ts`, `const store = createFsStore(RAW_DIR)` once in `runFetch`, pass `store` and the **basename** (`gradeLadder_${grade.id}.json`, etc.) into every `cachedGraphQL`. `capturedAt(gradeCachePath)` becomes `store.capturedAtMs(key)` (throw if undefined after a successful get/put).

- [ ] **Step 6: Run tests**

Run: `vp test src/pipeline/fetch/capture-store.test.ts src/pipeline/fetch/playhq-client.test.ts src/pipeline/fetch/run.test.ts src/pipeline/fetch/captured-at.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/fetch/capture-store.ts src/pipeline/fetch/capture-store.test.ts src/pipeline/fetch/playhq-client.ts src/pipeline/fetch/playhq-client.test.ts src/pipeline/fetch/run.ts
git commit -m "refactor: inject CaptureStore into the PlayHQ client"
```

---

### Task 2: Collect PlayHQ data without requiring CSV writes

**Files:**

- Create: `src/pipeline/fetch/to-import.ts`
- Create: `src/pipeline/fetch/to-import.test.ts`
- Modify: `src/pipeline/fetch/run.ts` — extract `collectPlayHqData`; `runFetch` writes CSV from that
- Modify: `scripts/fetch-playhq.ts` only if the report shape changes (it should not)

**Interfaces:**

- Consumes: `CaptureStore`, `cachedGraphQL`, `processGrade`, `toGameRows`, `ClubRegistry`
- Produces:

```ts
export type CollectOptions = {
    store: CaptureStore;
    cacheFirst: boolean;
    clubRegistry: ClubRegistry;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
    games?: boolean;
    years?: readonly number[];
    gradeId?: string;
};

export type CollectedPlayHq = {
    importData: ImportData;
    report: FetchReport;
};

export async function collectPlayHqData(
    options: CollectOptions,
): Promise<CollectedPlayHq>;

export function toImportData(input: {
    seasons: readonly SeasonRow[];
    clubs: readonly ClubRow[];
    aliases: readonly ClubAliasRow[];
    grades: readonly GradeRow[];
    teams: readonly TeamRow[];
    results: readonly Record<string, CsvValue>[];
    games: readonly GameRow[];
}): ImportData;
```

`runFetch` stays the CLI entry: create fs store, load registry from CSV, `collectPlayHqData`, then existing `writeCsvs` / `writeGamesCsvs`.

Worker path (later tasks) calls `collectPlayHqData` and never writes CSV.

- [ ] **Step 1: Write `to-import` tests from a minimal season/grade/team/result/game**

Map a `SeasonRow` with `is_final: 0` to `SeasonImportRow.isFinal === false`, `source: 'playhq'`, and `playhqId` preserved. Same for a `GameRow` → `GameImportRow` (`file` can be `games-<year>.csv` derived from `played_at` or `startYear` passed in).

- [ ] **Step 2: Run — fail on missing module**

Run: `vp test src/pipeline/fetch/to-import.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement mappers using the same field names `parse.ts` expects**

Do not re-parse CSV strings. Construct `ImportData` objects directly (`seasonKey` from `season_key`, etc.).

- [ ] **Step 4: Extract `collectPlayHqData` from the loop in `runFetch`**

Move the org/season/grade loop into `collectPlayHqData`. Filter seasons: if `years` is non-empty, keep `startYear` in that list; `gradeId` still restricts games as today. `cacheFirst` is `!refresh` from `FetchOptions`.

`runFetch` becomes: mkdir, load CSV registry + `is_final` map, `collectPlayHqData`, `writeCsvs`, `writeGamesCsvs`, return report.

Existing `run.test.ts` (`processGrade`, `resolveCompetitionKey`) must still pass — do not change those exports.

- [ ] **Step 5: Run**

Run: `vp test src/pipeline/fetch/`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: collect PlayHQ rows in memory before writing CSV"
```

---

### Task 3: Import from `ImportData` + subset counts + D1 executor

**Why:** `runImport` today loads CSV then `assertRowCountsMatch` against **whole tables**. A Worker importing only ACTIVE 2026 seasons would fail because D1 still holds 2022–2025. The Worker must upsert a subset and skip the whole-table count.

**Files:**

- Modify: `src/pipeline/import/run.ts`
- Modify: `src/pipeline/import/run.test.ts`
- Modify: `src/pipeline/import/executors.ts`
- Create: `src/pipeline/import/executors.test.ts`

**Interfaces:**

```ts
export type ImportCountsMode = 'exact' | 'subset';

export async function runImportData(
    data: ImportData,
    executor: ImportExecutor,
    counts: ImportCountsMode,
): Promise<ImportReport>;

export async function runImport(
    options: RunImportOptions,
): Promise<ImportReport>;
// runImport loads CSV then runImportData(data, executor, 'exact')

export function createD1Executor(db: D1Database): ImportExecutor;
```

- [ ] **Step 1: Write the failing subset test**

In `run.test.ts`, after importing the basic fixture (`exact`), call `runImportData` with **only one season’s worth** of rows cloned from that fixture (`subset`). Expect: no throw; D1 still has 2 seasons (the other season is not deleted); the imported season’s label/playhq_id updates if you change them in the subset payload.

- [ ] **Step 2: Run — fail because `runImportData` does not exist**

Run: `vp test src/pipeline/import/run.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `runImportData`**

Copy the body of `runImport` after `loadImportData`. When `counts === 'exact'`, keep `assertRowCountsMatch`. When `counts === 'subset'`, skip it (historical rows remain). Always `validateImportData`, drop unresolved games, `generateImportSql`, `executor.batch`, `assertGradeWeightCoverage`.

`runImport` becomes load CSV + `runImportData(..., 'exact')`.

- [ ] **Step 4: D1 executor tests with a fake**

```ts
type FakeStmt = { all: () => Promise<{ results: Record<string, unknown>[] }> };
const statements: string[] = [];
const fake = {
    prepare(sql: string) {
        statements.push(sql);
        return {
            all: async () => ({ results: [{ n: 1 }] }),
        };
    },
    async batch(stmts: FakeStmt[]) {
        await Promise.all(stmts.map((s) => s.all()));
    },
} as unknown as D1Database;

const executor = createD1Executor(fake);
await executor.queryAll('SELECT 1 AS n;');
await executor.batch(['INSERT INTO t DEFAULT VALUES;']);
expect(statements.length).toBeGreaterThan(0);
```

`createD1Executor`:

```ts
export function createD1Executor(db: D1Database): ImportExecutor {
    return {
        queryAll: async (sql) => {
            const result = await db.prepare(sql).all();
            return result.results ?? [];
        },
        batch: async (batch) => {
            await db.batch(batch.map((sql) => db.prepare(sql)));
        },
    };
}
```

- [ ] **Step 5: Run**

Run: `vp test src/pipeline/import/`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: import in-memory rows with subset upserts"
```

---

### Task 4: `import_runs` table + repo

**Files:**

- Modify: `src/db/schema.ts`
- Create: `drizzle/0008_import_runs.sql` (via `pnpm run db:generate`, then check the SQL is additive only)
- Create: `src/server/repos/import-runs.repo.ts`
- Create: `src/server/repos/import-runs.repo.test.ts`
- Modify: `src/pipeline/import/sqlite-test-db.ts` — no change if it already applies every `drizzle/*.sql`

**Interfaces:**

```ts
export const IMPORT_RUN_STATUSES = [
    'running',
    'ok',
    'error',
    'skipped',
] as const;
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export type ImportRun = {
    id: number;
    instanceId: string;
    startedAt: number; // epoch seconds
    finishedAt: number | null;
    status: ImportRunStatus;
    yearsJson: string | null;
    games: boolean;
    seasons: number | null;
    grades: number | null;
    teams: number | null;
    results: number | null;
    gamesCount: number | null;
    warningsJson: string | null;
    errorText: string | null;
};

export function createImportRunsRepo(db: Db): {
    list(): Promise<ImportRun[]>; // newest first
    hasRunning(): Promise<boolean>;
    runningOlderThan(epochSeconds: number): Promise<ImportRun[]>;
    insertRunning(input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
    }): Promise<number>; // id
    insertSkipped(input: {
        instanceId: string;
        startedAt: number;
        yearsJson: string | null;
        games: boolean;
        finishedAt: number;
    }): Promise<number>;
    markSkipped(id: number, finishedAt: number): Promise<void>;
    markOk(
        id: number,
        finishedAt: number,
        counts: {
            seasons: number;
            grades: number;
            teams: number;
            results: number;
            gamesCount: number;
            warningsJson: string;
        },
    ): Promise<void>;
    markError(id: number, finishedAt: number, errorText: string): Promise<void>;
};
```

Stale lock: a `running` row with `startedAt` older than **2 hours** is treated as crashed (Task 8 will `markError` then continue). Repo only queries; it does not decide.

- [ ] **Step 1: Add the drizzle table**

```ts
export const importRuns = sqliteTable('import_runs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    instanceId: text('instance_id').notNull().unique(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    status: text('status').notNull().$type<ImportRunStatus>(),
    yearsJson: text('years_json'),
    games: integer('games', { mode: 'boolean' }).notNull(),
    seasons: integer('seasons'),
    grades: integer('grades'),
    teams: integer('teams'),
    results: integer('results'),
    gamesCount: integer('games_count'),
    warningsJson: text('warnings_json'),
    errorText: text('error_text'),
});
```

Run: `pnpm run db:generate`

If the generator re-emits unrelated drop/creates, delete those from the new file (same as `0006_games.sql`’s comment). Keep only `CREATE TABLE import_runs` (+ indexes).

- [ ] **Step 2: Repo tests against `createMigratedDb` + drizzle sqlite-proxy**

Follow `src/server/repos/games.repo.test.ts`: open migrated sqlite, wrap as `Db`, insert a running row, `hasRunning() === true`, `list()` newest first, `markOk` clears running.

- [ ] **Step 3: Implement the repo with drizzle. Do not write raw SQL in the repo.**

- [ ] **Step 4: Run**

Run: `vp test src/server/repos/import-runs.repo.test.ts src/pipeline/import/run.test.ts`

Expected: PASS (`run.test.ts` still migrates).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add import_runs table and repo"
```

---

### Task 5: Admin password + signed cookie

**Files:**

- Create: `src/server/admin-auth.ts`
- Create: `src/server/admin-auth.test.ts`

**Interfaces:**

```ts
export const ADMIN_COOKIE = 'nod_admin';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function passwordsMatch(
    submitted: string,
    stored: string,
    sessionSecret: string,
): Promise<boolean>;

export async function signSession(
    expiresAtEpochSeconds: number,
    sessionSecret: string,
): Promise<string>; // `exp.<unix>.<hex hmac>`

export async function verifySession(
    cookieValue: string | undefined,
    sessionSecret: string,
    nowEpochSeconds: number,
): Promise<boolean>;

export function sessionCookieHeader(value: string): string;
export function clearSessionCookieHeader(): string;
```

HMAC-SHA256 via `crypto.subtle`. Encode UTF-8. `passwordsMatch`: HMAC both strings with `sessionSecret`, `timingSafeEqual` the two 32-byte digests. If `submitted` or `stored` is empty, return `false` **before** HMAC (do not compare empty secrets).

Cookie value: `exp.${expiresAt}.${hex}`. HMAC message is `exp.${expiresAt}` (no trailing hmac). `verifySession`: split on `.` — must be three parts, `exp` literal, integer expiry, hmac hex; reject if `nowEpochSeconds >= expiresAt`; then HMAC and `timingSafeEqual`.

`sessionCookieHeader`: `nod_admin=<value>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`

`clearSessionCookieHeader`: same with `Max-Age=0` and empty value.

Path is `/` so Start server functions receive the cookie.

- [ ] **Step 1: Write tests**

Equal passwords → true. Unequal → false. Empty submitted → false. Empty stored → false. Different lengths (short vs long) → false.

Cookie: sign, verify at `exp - 1` true; at `exp` false; tampered hmac false; missing undefined false; `exp.nope.ab` false.

- [ ] **Step 2: Run — fail**

Run: `vp test src/server/admin-auth.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement with Web Crypto only (no Node `crypto` module)**

```ts
async function hmacBytes(secret: string, message: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    return new Uint8Array(
        await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(message),
        ),
    );
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) return false;
    return crypto.subtle.timingSafeEqual(left, right);
}
```

If `crypto.subtle.timingSafeEqual` is missing in the local Node build, implement a constant-time XOR fold over the bytes **without** bitwise operators on numbers if lint forbids them — the repo bans bitwise operators. Use `crypto.subtle.timingSafeEqual` (Workers and Node 22+ have it). If lint flags it, wrap in a small helper file and eslint-disable that one call with a comment pointing at the spec.

- [ ] **Step 4: Run**

Run: `vp test src/server/admin-auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: HMAC admin password and session cookie"
```

---

### Task 6: Admin service + `/admin` UI

**Files:**

- Create: `src/server/dto/admin.dto.ts`
- Create: `src/server/services/admin.service.ts`
- Create: `src/server/services/admin.service.test.ts`
- Modify: `src/server/container.ts` — add `admin` (needs a `startImport` collaborator; see below)
- Create: `src/components/admin/admin-page.tsx`
- Create: `src/components/admin/admin-login-page.tsx`
- Create: `src/routes/admin.tsx`
- Create: `src/routes/admin.index.tsx`
- Create: `src/routes/admin.login.tsx`
- Modify: `src/components/site-header.tsx` — **do not** add Admin to `NAV`

**Interfaces:**

```ts
export type AdminRunDto = {
    id: number;
    startedLabel: string; // en-AU, Australia/Adelaide
    status: ImportRunStatus;
    seasons: number | null;
    grades: number | null;
    gamesCount: number | null;
    warningCount: number;
    durationLabel: string; // em dash if unfinished
    errorText: string | null;
    warnings: readonly string[];
};

export type AdminPageDto = {
    running: boolean;
    runningElapsedLabel: string | null;
    lastStatus: ImportRunStatus | null;
    runs: readonly AdminRunDto[];
};

export function createAdminService(
    repo: ReturnType<typeof createImportRunsRepo>,
    deps: {
        startImport: (params: {
            years?: number[];
            games: boolean;
        }) => Promise<void>;
    },
): {
    getPage(): Promise<AdminPageDto>;
    runImport(
        yearsText: string,
    ): Promise<
        Result<true, { kind: 'already-running' } | { kind: 'bad-years' }>
    >;
};
```

`yearsText` empty → `{ games: true }`. Non-empty → split on commas, every token a 4-digit year, else `bad-years`. If `hasRunning()`, return `already-running` and do not call `startImport`.

Do **not** read `cloudflare:workers` inside the service. The route’s server fn passes `startImport`. Until Task 8, the route can pass `async () => { throw new Error('import workflow is not wired yet'); }` — no: Task 6 tests mock `startImport`. The route in this task should call a function in `src/pipeline/import/start-import.ts`:

```ts
export async function startPlayHqImport(params: {
    years?: number[];
    games: boolean;
}): Promise<void> {
    const { env } = await import('cloudflare:workers');
    await env.PLAYHQ_IMPORT.create({
        id: `playhq-${new Date().toISOString()}`,
        params,
    });
}
```

That file will not typecheck until Task 8 adds the binding. **Defer `startPlayHqImport` to Task 8.** In Task 6, the route’s `runImport` server fn calls `createServices(getDb()).admin.runImport` with `startImport` injected at the container:

```ts
export function createServices(
    db: Db,
    extras?: { startImport?: AdminService['...'] },
): ...
```

Default `startImport` if omitted: `async () => { throw new Error('PLAYHQ_IMPORT is not bound'); }` so rankings tests stay unchanged (`createServices(getDb())` still works). Admin route passes the real starter once Task 8 lands.

Format times with `Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', dateStyle: 'medium', timeStyle: 'short' })`. Duration: `finishedAt - startedAt` as `Xm` / `Xh Ym`; running row uses `now - startedAt`. Missing finished → `NO_VALUE` (`—`) from `src/components/format.ts`.

`warningsJson` is a JSON array of strings (CLI-equivalent messages). `warningCount` is that array’s length.

- [ ] **Step 1: Service tests** with sqlite repo + mock `startImport`

Empty DB → `runs: []`, `running: false`. Fixture a `running` row → `running: true`, `runImport(' ') ` → `{ ok: false, error: { kind: 'already-running' } }` and mock not called. `runImport('2026, potato')` → `bad-years`. `runImport('')` on idle DB → mock called with `{ games: true }`. `runImport('2026')` → `{ years: [2026], games: true }`.

- [ ] **Step 2: Implement DTO + service + wire `createServices`**

- [ ] **Step 3: Login page + dashboard components**

Login: `Eyebrow` `ADMIN`, `PageTitle` `Sign in`, `<form method="post">` password input, submit “Sign in”. Error query `?error=1` shows “Wrong password.” (same string for every failure).

Dashboard: status strip (“Last run: … · ok” / “Import in progress · 12m”). Button “Run import” `disabled={running}`. Collapsed `<details>` with a years text field. Table via `Table` / `TableFrame` / `Th` / `Td` / `Tr` — **not** `DataTable`. Clicking a row (button in the first cell or a selected id in component state) shows `errorText` and `warnings` below. Sign out is a POST button in the page body.

Copy: do not put “Admin” in the public header.

- [ ] **Step 4: Routes**

`admin.login.tsx`: `validateSearch` `{ next?: string; error?: string }`. Loader does nothing. POST server fn: read `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from `env` (`cloudflare:workers`). `passwordsMatch` → set cookie, `throw redirect({ to: next && next.startsWith('/admin') ? next : '/admin' })`. Fail → redirect login with `error=1`. Never redirect `next` off `/admin` (open redirect).

`admin.tsx` layout `beforeLoad`: if pathname is `/admin/login`, return. Else `verifySession` on `nod_admin` cookie; fail → `throw redirect({ to: '/admin/login', search: { next: location.pathname } })`. `head`: `{ name: 'robots', content: 'noindex, nofollow' }`.

Cookie read: use `getRequest()` from `@tanstack/react-start/server` (or the equivalent export in the installed version — grep `getRequest` / `getCookie` under `node_modules/@tanstack/react-start`). Parse `Cookie` header if there is no helper.

`admin.index.tsx`: loader calls `admin.getPage()`. POST `runImport` and POST `logout` (clear cookie, redirect login).

- [ ] **Step 5: Loader must not query runs when unauthenticated**

Unit-test `verifySession` is enough for the gate. Add a service test that `getPage` is not called from auth helpers (auth helpers never import the repo — already true).

Smoke: `vp test src/server/admin-auth.test.ts src/server/services/admin.service.test.ts src/server/repos/import-runs.repo.test.ts`

- [ ] **Step 6: `vp check` + `vp test` on the new files. Commit**

```bash
git commit -m "feat: password-gated /admin import dashboard"
```

---

### Task 7: Club registry from D1 + PlayHQ job (no Workflow class yet)

**Files:**

- Create: `src/pipeline/fetch/club-registry-from-db.ts`
- Create: `src/pipeline/fetch/club-registry-from-db.test.ts`
- Create: `src/pipeline/import/playhq-job.ts`
- Create: `src/pipeline/import/playhq-job.test.ts`

**Interfaces:**

```ts
export async function clubRegistryFromExecutor(
    queryAll: ImportExecutor['queryAll'],
): Promise<ClubRegistry>;

export type PlayHqJobParams = { years?: number[]; games: boolean };

export async function runPlayHqJob(input: {
    params: PlayHqJobParams;
    store: CaptureStore;
    executor: ImportExecutor;
    cacheFirst: boolean;
    nowEpochSeconds: number;
    instanceId: string;
    runs: ReturnType<typeof createImportRunsRepo>;
    isFinalBySeasonKey: ReadonlyMap<string, string>;
}): Promise<ImportReport | { skipped: true }>;
```

Job algorithm:

1. If `hasRunning()` and the running row’s `startedAt` is newer than `now - 7200`, `insertSkipped` and return `{ skipped: true }`.
2. If a running row is older than 2 hours, `markError(..., 'stale running row')` then continue.
3. `insertRunning`.
4. `clubRegistryFromExecutor`.
5. `collectPlayHqData` with `cacheFirst: false` in production (tests pass `true` and a memory store seeded with probe JSON). Filter: if `params.years` set, those start years; else keep seasons whose PlayHQ status is `active` (already on `SeasonRow.status`).
6. `toImportData` including `clubRegistry.getClubs()` / `getAliases()`.
7. `runImportData(data, executor, 'subset')`.
8. `markOk` with counts + `JSON.stringify` of warning strings (same text as `scripts/import-csv.ts` prints).
9. `try/catch`: `markError` with `error.message`, rethrow.

`clubRegistryFromExecutor`: `SELECT club_key, name, established_year, home_venue, playhq_id FROM clubs` and aliases. Map nulls like the CSV loader.

- [ ] **Step 1: Registry test** — insert a club via sqlite after `runImport` of the basic fixture, `resolve` a known playhq id returns the curated key; a new org id mints a slug.

- [ ] **Step 2: Job test** — memory store seeded with the committed probe `discoverCompetitions` + one season + one ladder (use existing `data/raw/probe/` files). Sqlite executor with migrated DB. `cacheFirst: true` so no network. Assert an `import_runs` row `ok` (or `error` if the probe set is too small — if too small, seed extra JSON in the test, do not hit PlayHQ). Second overlapping call while you insert a fresh `running` row returns `{ skipped: true }`.

If wiring a full collect against probe files is too heavy for one test, test `runPlayHqJob` with a **injected** `collect` dependency:

```ts
collect?: typeof collectPlayHqData;
```

Default to real `collectPlayHqData`. Tests pass a stub returning a tiny `ImportData` built like `run.test.ts` fixtures. Prefer this so CI never talks to PlayHQ.

- [ ] **Step 3: Implement. Serial only. No PlayHQ `Promise.all`.**

- [ ] **Step 4: Run `vp test src/pipeline/import/playhq-job.test.ts src/pipeline/fetch/club-registry-from-db.test.ts`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: PlayHQ import job with D1 club registry and run lock"
```

---

### Task 8: R2 store, Workflow wrapper, wrangler, worker entry

**Files:**

- Create: `src/pipeline/fetch/r2-store.ts`
- Create: `src/pipeline/fetch/r2-store.test.ts` (fake R2 bucket)
- Create: `src/pipeline/import/workflow.ts`
- Create: `src/pipeline/import/start-import.ts`
- Create: `src/worker.ts`
- Modify: `wrangler.jsonc`
- Modify: `src/server/container.ts` / admin route to call `startPlayHqImport`
- Modify: `src/db/index.ts` only if the job needs `getDb()` inside the Workflow (`this.env.DB` + drizzle). Prefer `createD1Executor(this.env.DB)` and drizzle `drizzle(this.env.DB, { schema, casing: 'snake_case' })` inside the workflow, not `getDb()` (that uses the request-scoped `env` import).

**Interfaces:**

```ts
export function createR2Store(bucket: R2Bucket): CaptureStore;

export class PlayHqImportWorkflow extends WorkflowEntrypoint<
    Env,
    PlayHqJobParams
> {
    async run(
        event: WorkflowEvent<PlayHqJobParams>,
        step: WorkflowStep,
    ): Promise<void>;
}
```

Fake R2 for tests:

```ts
class MemoryR2 {
    private readonly map = new Map<
        string,
        { body: string; capturedAtMs: string }
    >();
    async get(key: string) {
        const hit = this.map.get(key);
        if (!hit) return null;
        return {
            json: async () => JSON.parse(hit.body) as unknown,
            customMetadata: { capturedAtMs: hit.capturedAtMs },
        };
    }
    async put(
        key: string,
        value: string,
        opts?: { customMetadata?: Record<string, string> },
    ) {
        this.map.set(key, {
            body: value,
            capturedAtMs: opts?.customMetadata?.capturedAtMs ?? '0',
        });
    }
}
```

R2 keys: `raw/${key}` for GraphQL, `runs/${instanceId}/import.json` only if a later step needs it. v1 can skip the staged import JSON if `ImportData` stays under 1 MiB for a current-season subset (it will). Do not return full payloads from `step.do` — return `{ key }` or counts.

Workflow `run`:

```ts
const params = event.params ?? { games: true };
const instanceId = event.instanceId;
await step.do(
    'lock-and-import',
    {
        retries: { limit: 0, delay: '10 seconds', backoff: 'constant' },
    },
    async () => {
        const executor = createD1Executor(this.env.DB);
        const db = drizzle(this.env.DB, { schema, casing: 'snake_case' });
        await runPlayHqJob({
            params,
            store: createR2Store(this.env.PLAYHQ_RAW),
            executor,
            cacheFirst: false,
            nowEpochSeconds: Math.floor(Date.now() / 1000),
            instanceId,
            runs: createImportRunsRepo(db),
            isFinalBySeasonKey: await loadIsFinalMap(executor),
        });
    },
);
```

**Do not** put one GraphQL call per `step.do` in v1 if that requires copying the collect loop into the workflow class. The spec preferred per-call steps for 403 retry; `requestGraphQL` already retries 6 times with 10s backoff. That is enough for v1. A later pass can split steps. YAGNI.

**Do** keep PlayHQ serial inside `collectPlayHqData`.

`loadIsFinalMap`: `SELECT season_key, is_final FROM seasons` — Worker must not clobber curated `is_final` from CSV. Pass that map into collect the same way `runFetch` does.

`wrangler.jsonc` additions (no `schedules` yet):

```jsonc
"main": "src/worker.ts",
"r2_buckets": [
    { "binding": "PLAYHQ_RAW", "bucket_name": "netball-stats-playhq-raw" }
],
"workflows": [
    {
        "name": "playhq-import",
        "binding": "PLAYHQ_IMPORT",
        "class_name": "PlayHqImportWorkflow"
    }
]
```

Create the bucket: `npx wrangler r2 bucket create netball-stats-playhq-raw`

`src/worker.ts`:

```ts
import handler from '@tanstack/react-start/server-entry';
export { PlayHqImportWorkflow } from '@/pipeline/import/workflow';
export default handler;
```

If the Cloudflare Vite plugin refuses `main: src/worker.ts`, keep `main` as the Start entry and add `exports` / check plugin docs for `additionalModules`. The wrapper above is the intended shape.

`startPlayHqImport` as in Task 6. Wire the admin POST to it. `env.PLAYHQ_IMPORT.create({ params })` — let Cloudflare assign the instance id (do not reuse ids).

After bindings change: `pnpm run cf-typegen`.

- [ ] **Step 1: R2 store tests with the memory fake**

- [ ] **Step 2: Implement r2-store, workflow, worker.ts, wrangler.jsonc, bucket, typegen, start-import**

- [ ] **Step 3: `vp check` (types must include `PLAYHQ_IMPORT` and `PLAYHQ_RAW`)**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: PlayHQ import workflow and R2 capture store"
```

---

### Task 9: Worker-isolate spike, then enable cron + docs

**Files:**

- Modify: `wrangler.jsonc` — add `schedules` only after the spike
- Modify: `docs/deployment.md`
- Modify: `PLAN.md` — replace “No Worker-side sync” with a pointer to the spec
- Modify: `docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md` — record spike HTTP status

**Spike (gate):**

- [ ] **Step 1: Put secrets**

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
```

`ADMIN_SESSION_SECRET` must be ≥32 random bytes (hex or base64).

- [ ] **Step 2: Deploy a version and hit PlayHQ from the Worker**

Temporary: in `PlayHqImportWorkflow.run`, first `step.do('probe', async () => { const res = await fetch('https://api.playhq.com/graphql', { method: 'POST', headers: { ...same as client... }, body: discoverCompetitions for AMND }); return { status: res.status }; })`.

Deploy with `pnpm run cf:deploy` **or** trigger via `npx wrangler workflows trigger playhq-import`.

Read logs (`npx wrangler tail` or dashboard). Record `status` in the spec under Testing.

- [ ] **Step 3: Gate**

If status is **200**: delete the probe step, keep the real job.

If status is a **standing 403** (every retry): **stop**. Do not add `schedules`. Do not pretend it works. Note the tunnel fallback from the spec; do not implement the tunnel in this plan.

- [ ] **Step 4: Enable cron only on a 200**

```jsonc
"schedules": ["30 22 * * SAT"]
```

on the Workflow binding. Redeploy.

- [ ] **Step 5: Docs**

`docs/deployment.md`: R2 bucket name, Workflow name, secrets, `/admin/login` (no public link), preview builds still must not migrate from random branches (existing rule). Admin secrets are production Worker secrets, not committed.

`PLAN.md`: delete the hard “No Worker-side sync” / “A Worker cannot run a browser” sentences. Replace with: live ACTIVE seasons sync via `PlayHqImportWorkflow`; git CSV remains the archive for completed seasons; see `docs/superpowers/specs/2026-08-13-playhq-automated-import-design.md`.

- [ ] **Step 6: `vp check` && `vp test`. Commit**

```bash
git commit -m "docs: enable weekly PlayHQ import cron after Worker probe"
```

If the spike failed, commit the probe notes instead and leave `schedules` off:

```bash
git commit -m "docs: record PlayHQ Worker isolate probe failure; cron left disabled"
```

---

## Self-Review

**Spec coverage**

| Spec item                                         | Task                                  |
| ------------------------------------------------- | ------------------------------------- |
| CaptureStore / no `node:fs` in the client         | 1                                     |
| Collect without CSV; CLI still writes CSV         | 2                                     |
| D1 executor; subset upsert; validate before write | 3                                     |
| `import_runs` running→ok/error/skipped            | 4, 7                                  |
| ACTIVE seasons; years override                    | 7                                     |
| Serial PlayHQ; 1 req/sec (existing rate limit)    | 1, 7                                  |
| R2 raw; Workflow; worker entry                    | 8                                     |
| Admin password cookie; no Access-on-workers.dev   | 5–6                                   |
| `/admin` table, run button, noindex, no nav link  | 6                                     |
| No schedules until isolate 200                    | 9                                     |
| Club registry from D1                             | 7                                     |
| `is_final` not clobbered                          | 8 (`loadIsFinalMap`)                  |
| Tunnel fallback                                   | 9 gate (stop, don’t build)            |
| dump-csv.ts                                       | out of scope (spec: optional, not v1) |
| Per-GraphQL `step.do`                             | deferred YAGNI; client retries remain |

**Placeholders:** none intended. Cookie helper import path is “grep the installed Start package” because this repo has no cookie usage yet — that is a lookup, not a TBD feature.

**Types:** `CaptureStore`, `ImportCountsMode`, `PlayHqJobParams`, `ImportRunStatus`, `AdminPageDto` are named consistently across tasks.

**Incremental-count trap:** Task 3 exists specifically so Task 7’s subset import does not trip `assertRowCountsMatch`.
