/**
 * Validates parsed CSV rows before anything is written. Reuses the Zod insert
 * schemas from `src/db/validation.ts` for per-row field rules (via a placeholder
 * `0` for the integer foreign keys the CSVs don't carry — those are resolved
 * and checked separately below, against the sibling CSVs / DB catalogue), then
 * layers the cross-file invariants from the task brief on top.
 */
import { z } from 'zod';
import {
    clubAliasInsertSchema,
    clubInsertSchema,
    gradeInsertSchema,
    seasonInsertSchema,
    teamInsertSchema,
    teamSeasonResultInsertSchema,
} from '@/db/validation';
import type {
    ClubAliasImportRow,
    ClubImportRow,
    GradeImportRow,
    ImportData,
    PlayedMismatchWarning,
    SeasonImportRow,
    TeamCountWarning,
    TeamImportRow,
    TeamSeasonResultImportRow,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';

function issueMessage(error: z.ZodError): string {
    return error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
}

// header + 1-based row number
function line(index: number): number {
    return index + 2;
}

export function validateSeasons(
    rows: readonly SeasonImportRow[],
    knownCompetitionKeys: ReadonlySet<string>,
): void {
    rows.forEach((row, index) => {
        const result = seasonInsertSchema.safeParse({
            ...row,
            competitionId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                'seasons.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!knownCompetitionKeys.has(row.competitionKey)) {
            throw new ImportValidationError(
                'seasons.csv',
                line(index),
                `unknown competition_key ${row.competitionKey} — run db:migrate:local/remote first`,
                row.competitionKey,
            );
        }
    });
    const seasonKeys = new Set<string>();
    rows.forEach((row, index) => {
        if (seasonKeys.has(row.seasonKey)) {
            throw new ImportValidationError(
                'seasons.csv',
                line(index),
                `duplicate season_key ${row.seasonKey}`,
                row.seasonKey,
            );
        }
        seasonKeys.add(row.seasonKey);
    });
}

export function validateClubs(rows: readonly ClubImportRow[]): void {
    const clubKeys = new Set<string>();
    rows.forEach((row, index) => {
        const result = clubInsertSchema.safeParse(row);
        if (!result.success) {
            throw new ImportValidationError(
                'clubs.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                'clubs.csv',
                line(index),
                `duplicate club_key ${row.clubKey}`,
                row.clubKey,
            );
        }
        clubKeys.add(row.clubKey);
    });
}

export function validateClubAliases(
    rows: readonly ClubAliasImportRow[],
    clubKeys: ReadonlySet<string>,
): void {
    rows.forEach((row, index) => {
        const result = clubAliasInsertSchema.safeParse({
            ...row,
            clubId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                'club_aliases.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                'club_aliases.csv',
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
    });
}

export function validateGrades(
    rows: readonly GradeImportRow[],
    seasonKeys: ReadonlySet<string>,
): void {
    const gradeKeys = new Set<string>();
    rows.forEach((row, index) => {
        const result = gradeInsertSchema.safeParse({ ...row, seasonId: 0 });
        if (!result.success) {
            throw new ImportValidationError(
                'grades.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!seasonKeys.has(row.seasonKey)) {
            throw new ImportValidationError(
                'grades.csv',
                line(index),
                `season_key ${row.seasonKey} not found in seasons.csv`,
                row.seasonKey,
            );
        }
        if (gradeKeys.has(row.gradeKey)) {
            throw new ImportValidationError(
                'grades.csv',
                line(index),
                `duplicate grade_key ${row.gradeKey}`,
                row.gradeKey,
            );
        }
        gradeKeys.add(row.gradeKey);
    });
}

/**
 * The team natural key is `(grade_key, club_key, squad_number)`. Two rows
 * colliding on it would silently upsert into one team, dropping a result row
 * downstream (this is exactly how the fetch stage lost 153/1600 rows before
 * the squad-number parsing fix) — so it's a hard failure here, never a
 * silent last-write-wins, naming the file, the key and every colliding row.
 */
function checkTeamNaturalKeyCollisions(rows: readonly TeamImportRow[]): void {
    // Maps natural key -> first 1-based line it appeared on.
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
        const key = `${row.gradeKey}|${row.clubKey}|${row.squadNumber ?? 'null'}`;
        const firstLine = seen.get(key);
        if (firstLine !== undefined) {
            throw new ImportValidationError(
                'teams.csv',
                line(index),
                `duplicate natural key (grade_key=${row.gradeKey}, club_key=${row.clubKey}, squad_number=${row.squadNumber ?? 'null'}) — ` +
                    `also present at line ${firstLine} (display_name="${row.displayName}")`,
                { key, firstLine, line: line(index) },
            );
        }
        seen.set(key, line(index));
    });
}

export function validateTeams(
    rows: readonly TeamImportRow[],
    clubKeys: ReadonlySet<string>,
    gradeKeys: ReadonlySet<string>,
): void {
    rows.forEach((row, index) => {
        const result = teamInsertSchema.safeParse({
            ...row,
            clubId: 0,
            gradeId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                'teams.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                'teams.csv',
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
        if (!gradeKeys.has(row.gradeKey)) {
            throw new ImportValidationError(
                'teams.csv',
                line(index),
                `grade_key ${row.gradeKey} not found in grades.csv`,
                row.gradeKey,
            );
        }
    });
    checkTeamNaturalKeyCollisions(rows);
}

/**
 * `played = won + drawn + lost` is checked here, not in the Zod schema —
 * PlayHQ's own upstream ladder data is internally inconsistent for ~1.6% of
 * rows (verified against the raw capture: byes do not explain it either).
 * Blocking a 1600-row import on 25 upstream errors we cannot fix and must
 * not invent values for is the wrong trade-off. So this is a warning, not a
 * validation failure: the row imports with its values completely unchanged,
 * and the discrepancy is mirrored into `notes` so it stays visible
 * downstream. Every other invariant in this file remains a hard failure.
 */
function playedMismatchNote(
    played: number,
    won: number,
    drawn: number,
    lost: number,
): string {
    return `Upstream data inconsistency: played=${played} but won+drawn+lost=${won + drawn + lost} (won=${won}, drawn=${drawn}, lost=${lost}). Imported unchanged from source.`;
}

function checkPlayedReconciliation(
    row: TeamSeasonResultImportRow,
): PlayedMismatchWarning | null {
    const { played, won, drawn, lost } = row;
    if (
        played === null ||
        won === null ||
        drawn === null ||
        lost === null ||
        played === won + drawn + lost
    ) {
        return null;
    }
    const note = playedMismatchNote(played, won, drawn, lost);
    row.notes = row.notes === null ? note : `${row.notes} ${note}`;
    return {
        gradeKey: row.gradeKey,
        clubKey: row.clubKey,
        displayName: row.displayName,
        played,
        won,
        drawn,
        lost,
    };
}

export function validateResults(
    rows: readonly TeamSeasonResultImportRow[],
    clubKeys: ReadonlySet<string>,
    gradesByKey: ReadonlyMap<string, GradeImportRow>,
): PlayedMismatchWarning[] {
    rows.forEach((row, index) => {
        const result = teamSeasonResultInsertSchema.safeParse({
            ...row,
            teamId: 0,
            gradeId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                'team_season_results.csv',
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                'team_season_results.csv',
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
        if (!gradesByKey.has(row.gradeKey)) {
            throw new ImportValidationError(
                'team_season_results.csv',
                line(index),
                `grade_key ${row.gradeKey} not found in grades.csv`,
                row.gradeKey,
            );
        }
    });

    // Ladder positions per grade must be exactly 1..n, and grade.team_count
    // must equal the number of result rows for that grade.
    const byGrade = new Map<string, TeamSeasonResultImportRow[]>();
    for (const row of rows) {
        const existing = byGrade.get(row.gradeKey);
        if (existing === undefined) byGrade.set(row.gradeKey, [row]);
        else existing.push(row);
    }
    for (const [gradeKey, gradeRows] of byGrade) {
        const positions = gradeRows
            .map((row) => row.ladderPosition)
            .toSorted((a, b) => a - b);
        const expected = Array.from(
            { length: gradeRows.length },
            (_, i) => i + 1,
        );
        const matches =
            positions.length === expected.length &&
            positions.every((value, i) => value === expected[i]);
        if (!matches) {
            throw new ImportValidationError(
                'team_season_results.csv',
                null,
                `ladder positions for grade ${gradeKey} are not exactly 1..${gradeRows.length}: got [${positions.join(',')}]`,
                gradeKey,
            );
        }
        // Same natural-key collision hazard as teams.csv: two result rows
        // resolving to the same (grade, club, squad_number) team would
        // upsert into one team_season_results row and silently drop the
        // other.
        const seenTeamKeys = new Map<string, number>();
        gradeRows.forEach((row) => {
            const rowIndex = rows.indexOf(row);
            const key = `${row.clubKey}|${row.squadNumber ?? 'null'}`;
            const firstLine = seenTeamKeys.get(key);
            if (firstLine !== undefined) {
                throw new ImportValidationError(
                    'team_season_results.csv',
                    line(rowIndex),
                    `duplicate natural key (grade_key=${gradeKey}, club_key=${row.clubKey}, squad_number=${row.squadNumber ?? 'null'}) — ` +
                        `also present at line ${firstLine} (display_name="${row.displayName}")`,
                    { key, firstLine, line: line(rowIndex) },
                );
            }
            seenTeamKeys.set(key, line(rowIndex));
        });
        const grade = gradesByKey.get(gradeKey);
        if (grade !== undefined && grade.teamCount !== gradeRows.length) {
            throw new ImportValidationError(
                'team_season_results.csv',
                null,
                `grade ${gradeKey} declares team_count ${grade.teamCount} but has ${gradeRows.length} result row(s)`,
                gradeKey,
            );
        }
    }

    return rows.reduce<PlayedMismatchWarning[]>((warnings, row) => {
        const warning = checkPlayedReconciliation(row);
        if (warning !== null) warnings.push(warning);
        return warnings;
    }, []);
}

/**
 * Not a failure — a real signal a scrape went wrong, but not one that should
 * block an import (a grade genuinely can shrink or grow between seasons).
 * Compares a grade to the same (competitionKey, tier, division) grade in the
 * immediately preceding season of the same competition.
 */
export function findTeamCountWarnings(data: ImportData): TeamCountWarning[] {
    const seasonByKey = new Map(data.seasons.map((s) => [s.seasonKey, s]));
    type Key = string;
    const gradeByCompTierDivSeason = new Map<
        Key,
        { seasonKey: string; startYear: number; grade: GradeImportRow }[]
    >();
    for (const grade of data.grades) {
        const season = seasonByKey.get(grade.seasonKey);
        if (season === undefined) continue;
        const key = `${season.competitionKey}|${grade.tier}|${grade.division ?? ''}`;
        const list = gradeByCompTierDivSeason.get(key) ?? [];
        list.push({
            seasonKey: grade.seasonKey,
            startYear: season.startYear,
            grade,
        });
        gradeByCompTierDivSeason.set(key, list);
    }

    const SHARP_CHANGE_RATIO = 0.4;
    const warnings: TeamCountWarning[] = [];
    for (const entries of gradeByCompTierDivSeason.values()) {
        entries.sort((a, b) => a.startYear - b.startYear);
        for (let i = 1; i < entries.length; i += 1) {
            const prev = entries[i - 1];
            const curr = entries[i];
            if (prev === undefined || curr === undefined) continue;
            const diff = Math.abs(curr.grade.teamCount - prev.grade.teamCount);
            if (
                diff / Math.max(prev.grade.teamCount, 1) >=
                SHARP_CHANGE_RATIO
            ) {
                warnings.push({
                    gradeKey: curr.grade.gradeKey,
                    previousGradeKey: prev.grade.gradeKey,
                    teamCount: curr.grade.teamCount,
                    previousTeamCount: prev.grade.teamCount,
                });
            }
        }
    }
    return warnings;
}

export type ImportWarnings = {
    teamCountWarnings: TeamCountWarning[];
    playedMismatchWarnings: PlayedMismatchWarning[];
};

export function validateImportData(
    data: ImportData,
    knownCompetitionKeys: ReadonlySet<string>,
): ImportWarnings {
    validateSeasons(data.seasons, knownCompetitionKeys);
    validateClubs(data.clubs);
    const clubKeys = new Set(data.clubs.map((c) => c.clubKey));
    validateClubAliases(data.clubAliases, clubKeys);
    const seasonKeys = new Set(data.seasons.map((s) => s.seasonKey));
    validateGrades(data.grades, seasonKeys);
    const gradeKeys = new Set(data.grades.map((g) => g.gradeKey));
    validateTeams(data.teams, clubKeys, gradeKeys);
    const gradesByKey = new Map(data.grades.map((g) => [g.gradeKey, g]));
    const playedMismatchWarnings = validateResults(
        data.results,
        clubKeys,
        gradesByKey,
    );
    return {
        teamCountWarnings: findTeamCountWarnings(data),
        playedMismatchWarnings,
    };
}
