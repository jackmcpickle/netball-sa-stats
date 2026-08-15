/**
 * Cross-checks imported fixtures against the ladders we already trust: for
 * every team, the wins/losses/draws derived from `games` must match
 * `team_season_results`. A mismatch means the fixture mapping is wrong, and it
 * is far cheaper to find here than after head-to-head is live.
 *
 * Expect a handful of legitimate mismatches — `PlayedMismatchWarning` in
 * `src/pipeline/import/types.ts` documents that PlayHQ's own ladder data is
 * internally inconsistent for a small fraction of rows. Investigate anything
 * systematic (a whole grade, or every row off by the same amount).
 *
 * Usage:
 *   pnpm exec tsx scripts/check-games.ts [--year=2026] [--grade=<grade_key>]
 */
import { createWranglerExecutor } from '../src/pipeline/import/executors.ts';
import type { ImportExecutor } from '../src/pipeline/import/types.ts';

const target = process.argv.includes('--remote') ? 'remote' : 'local';
const yearArg = process.argv.find((arg) => arg.startsWith('--year='));
const gradeArg = process.argv.find((arg) => arg.startsWith('--grade='));
const year =
    yearArg === undefined ? null : Number(yearArg.slice('--year='.length));
const gradeKey = gradeArg?.slice('--grade='.length) ?? null;

/**
 * Wins/losses/draws per team, derived from games. Forfeits count as results;
 * byes, no-results and scheduled games do not. A forfeit's 0-20 scoreline is
 * PlayHQ's own fabrication, so the winner comes from `forfeiting_side`, never
 * from comparing scores.
 *
 * Two things must line up for this to compare like with like:
 *  - **Finals are excluded.** A ladder is the regular season only, so counting
 *    finals would show every finalist with more wins than the ladder gives it.
 *  - **Tallied per team, not per team-and-grade.** Junior grading rounds mean a
 *    team plays its first games in a grade it is not on the ladder of; scoping
 *    to the game's grade would drop those and undercount.
 */
const SQL = `
WITH sides AS (
    SELECT
        g.grade_id,
        g.home_team_id AS team_id,
        CASE
            WHEN g.status = 'forfeit' THEN
                CASE g.forfeiting_side WHEN 'home' THEN 'L' WHEN 'away' THEN 'W' ELSE 'L' END
            WHEN g.home_score > g.away_score THEN 'W'
            WHEN g.home_score < g.away_score THEN 'L'
            ELSE 'D'
        END AS outcome
    FROM games g
    WHERE g.status IN ('final', 'forfeit') AND g.is_finals = 0
      AND g.home_team_id IS NOT NULL
    UNION ALL
    SELECT
        g.grade_id,
        g.away_team_id AS team_id,
        CASE
            WHEN g.status = 'forfeit' THEN
                CASE g.forfeiting_side WHEN 'away' THEN 'L' WHEN 'home' THEN 'W' ELSE 'L' END
            WHEN g.away_score > g.home_score THEN 'W'
            WHEN g.away_score < g.home_score THEN 'L'
            ELSE 'D'
        END AS outcome
    FROM games g
    WHERE g.status IN ('final', 'forfeit') AND g.is_finals = 0
      AND g.away_team_id IS NOT NULL
),
tally AS (
    SELECT
        team_id,
        SUM(CASE WHEN outcome = 'W' THEN 1 ELSE 0 END) AS won,
        SUM(CASE WHEN outcome = 'L' THEN 1 ELSE 0 END) AS lost,
        SUM(CASE WHEN outcome = 'D' THEN 1 ELSE 0 END) AS drawn
    FROM sides
    GROUP BY team_id
)
SELECT
    gr.grade_key AS gradeKey,
    s.start_year AS year,
    t.display_name AS team,
    r.won AS ladderWon, r.lost AS ladderLost, r.drawn AS ladderDrawn,
    COALESCE(ty.won, 0) AS gamesWon,
    COALESCE(ty.lost, 0) AS gamesLost,
    COALESCE(ty.drawn, 0) AS gamesDrawn
FROM team_season_results r
JOIN teams t ON t.id = r.team_id
JOIN grades gr ON gr.id = r.grade_id
JOIN seasons s ON s.id = gr.season_id
LEFT JOIN tally ty ON ty.team_id = r.team_id
WHERE EXISTS (SELECT 1 FROM games g WHERE g.grade_id = r.grade_id)
ORDER BY gr.grade_key, r.ladder_position;
`;

type QueryRow = Awaited<ReturnType<ImportExecutor['queryAll']>>[number];

interface Row {
    gradeKey: string;
    year: number;
    team: string;
    ladderWon: number;
    ladderLost: number;
    ladderDrawn: number;
    gamesWon: number;
    gamesLost: number;
    gamesDrawn: number;
}

// Same route to D1 the importer uses, so there is one way to reach it.
const executor = createWranglerExecutor('netball-stats', target);

/**
 * D1 hands back untyped column bags. Coerce at the boundary rather than
 * asserting, so a renamed column shows up as `NaN`/`undefined` here and not as
 * a silent lie about the row shape.
 */
function toRow(raw: QueryRow): Row {
    return {
        gamesDrawn: Number(raw.gamesDrawn),
        gamesLost: Number(raw.gamesLost),
        gamesWon: Number(raw.gamesWon),
        gradeKey: String(raw.gradeKey),
        ladderDrawn: Number(raw.ladderDrawn),
        ladderLost: Number(raw.ladderLost),
        ladderWon: Number(raw.ladderWon),
        team: String(raw.team),
        year: Number(raw.year),
    };
}

const rawRows = await executor.queryAll(SQL);
const rows = rawRows.map(toRow);
const scoped = rows.filter(
    (row) =>
        (year === null || row.year === year) &&
        (gradeKey === null || row.gradeKey === gradeKey),
);

const mismatched = scoped.filter(
    (row) =>
        row.ladderWon !== row.gamesWon ||
        row.ladderLost !== row.gamesLost ||
        row.ladderDrawn !== row.gamesDrawn,
);

console.warn(
    `checked ${String(scoped.length)} team-season row(s) against games`,
);
for (const row of mismatched) {
    console.warn(
        `  ${row.gradeKey} ${row.team}: ladder ${String(row.ladderWon)}-${String(row.ladderLost)}-${String(row.ladderDrawn)} vs games ${String(row.gamesWon)}-${String(row.gamesLost)}-${String(row.gamesDrawn)}`,
    );
}
const byGrade = new Map<string, number>();
for (const row of mismatched) {
    byGrade.set(row.gradeKey, (byGrade.get(row.gradeKey) ?? 0) + 1);
}
const systematic = [...byGrade].filter(([, count]) => count > 2);
console.warn(
    `${String(mismatched.length)} mismatch(es) across ${String(byGrade.size)} grade(s)`,
);
if (systematic.length > 0) {
    console.warn(
        `grades with >2 mismatched teams (investigate — likely a mapping bug, not upstream noise): ${systematic
            .map(([grade, count]) => `${grade} (${String(count)})`)
            .join(', ')}`,
    );
}
