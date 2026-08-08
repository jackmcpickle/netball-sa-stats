import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const command = process.argv[2] ?? 'fetch';

if (command === 'fetch') {
    const { fetchArchivePdfs } =
        await import('../src/pipeline/archive/fetch-pdfs.ts');
    const rows = await fetchArchivePdfs({
        rawDir: resolve(rootDir, 'data/raw/archive'),
    });
    for (const row of rows) {
        console.warn(`${String(row.year)} ${row.status}: ${row.path}`);
    }
} else if (command === 'merge') {
    const { runArchiveBackfill } =
        await import('../src/pipeline/archive/run.ts');
    const report = await runArchiveBackfill({ rootDir });
    console.warn(
        `archive backfill merged ${String(report.seasons)} seasons, ${String(report.grades)} grades, ${String(report.teams)} teams, ${String(report.results)} results`,
    );
} else {
    throw new Error(
        `Unknown archive command "${command}" (expected fetch or merge)`,
    );
}
