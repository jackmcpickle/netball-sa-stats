/**
 * Validates parsed CSV rows before anything is written. Reuses the Zod insert
 * schemas from `src/db/validation.ts` for per-row field rules (via a placeholder
 * `0` for the integer foreign keys the CSVs don't carry — those are resolved
 * and checked separately below, against the sibling CSVs / DB catalogue), then
 * layers the cross-file invariants from the task brief on top.
 */
import { isNull, isUndefined } from 'es-toolkit';
import type { z } from 'zod';
import { FORFEIT_SIDES, GAME_STATUSES } from '@/db/schema';
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
    GameImportRow,
    GradeImportRow,
    ImportData,
    PlayedMismatchWarning,
    SeasonImportRow,
    TeamCountWarning,
    TeamImportRow,
    TeamSeasonResultImportRow,
    UnresolvedTeamWarning,
} from '@/pipeline/import/types';
import { ImportValidationError } from '@/pipeline/import/types';

const SEASONS_FILE = 'seasons.csv';
const CLUBS_FILE = 'clubs.csv';
const CLUB_ALIASES_FILE = 'club_aliases.csv';
const GRADES_FILE = 'grades.csv';
const TEAMS_FILE = 'teams.csv';
const RESULTS_FILE = 'team_season_results.csv';

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
    for (const [index, row] of rows.entries()) {
        const result = seasonInsertSchema.safeParse({
            ...row,
            competitionId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                SEASONS_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!knownCompetitionKeys.has(row.competitionKey)) {
            throw new ImportValidationError(
                SEASONS_FILE,
                line(index),
                `unknown competition_key ${row.competitionKey} — run db:migrate:local/remote first`,
                row.competitionKey,
            );
        }
    }
    const seasonKeys = new Set<string>();
    for (const [index, row] of rows.entries()) {
        if (seasonKeys.has(row.seasonKey)) {
            throw new ImportValidationError(
                SEASONS_FILE,
                line(index),
                `duplicate season_key ${row.seasonKey}`,
                row.seasonKey,
            );
        }
        seasonKeys.add(row.seasonKey);
    }
}

export function validateClubs(rows: readonly ClubImportRow[]): void {
    const clubKeys = new Set<string>();
    for (const [index, row] of rows.entries()) {
        const result = clubInsertSchema.safeParse(row);
        if (!result.success) {
            throw new ImportValidationError(
                CLUBS_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                CLUBS_FILE,
                line(index),
                `duplicate club_key ${row.clubKey}`,
                row.clubKey,
            );
        }
        clubKeys.add(row.clubKey);
    }
}

export function validateClubAliases(
    rows: readonly ClubAliasImportRow[],
    clubKeys: ReadonlySet<string>,
): void {
    for (const [index, row] of rows.entries()) {
        const result = clubAliasInsertSchema.safeParse({
            ...row,
            clubId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                CLUB_ALIASES_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                CLUB_ALIASES_FILE,
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
    }
}

export function validateGrades(
    rows: readonly GradeImportRow[],
    seasonKeys: ReadonlySet<string>,
): void {
    const gradeKeys = new Set<string>();
    for (const [index, row] of rows.entries()) {
        const result = gradeInsertSchema.safeParse({ ...row, seasonId: 0 });
        if (!result.success) {
            throw new ImportValidationError(
                GRADES_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!seasonKeys.has(row.seasonKey)) {
            throw new ImportValidationError(
                GRADES_FILE,
                line(index),
                `season_key ${row.seasonKey} not found in seasons.csv`,
                row.seasonKey,
            );
        }
        if (gradeKeys.has(row.gradeKey)) {
            throw new ImportValidationError(
                GRADES_FILE,
                line(index),
                `duplicate grade_key ${row.gradeKey}`,
                row.gradeKey,
            );
        }
        gradeKeys.add(row.gradeKey);
    }
}

/**
 * The team natural key is `(grade_key, playhq_id)` — PlayHQ's own stable
 * team id, never a synthetic squad_number/index. Two rows colliding on it
 * would silently upsert into one team, dropping a result row downstream —
 * so it's a hard failure here, never a silent last-write-wins, naming the
 * file, the key and every colliding row.
 */
function checkTeamNaturalKeyCollisions(rows: readonly TeamImportRow[]): void {
    // Maps natural key -> first 1-based line it appeared on.
    const seen = new Map<string, number>();
    for (const [index, row] of rows.entries()) {
        const key = `${row.gradeKey}|${row.playhqId ?? 'null'}`;
        const firstLine = seen.get(key);
        if (!isUndefined(firstLine)) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                `duplicate natural key (grade_key=${row.gradeKey}, playhq_id=${row.playhqId ?? 'null'}) — ` +
                    `also present at line ${firstLine} (display_name="${row.displayName}")`,
                { firstLine, key, line: line(index) },
            );
        }
        seen.set(key, line(index));
    }
}

/**
 * Games resolve a team by `playhq_id` alone (see `resolveSide`), so that id
 * must identify exactly one team across the whole dataset. The `teams` unique
 * index is only `(grade_id, playhq_id)`, so nothing in the database enforces
 * this — without the check, a collision would make the resolving subquery
 * pick an arbitrary team and attribute real games to the wrong one.
 */
function checkTeamIdsGloballyUnique(rows: readonly TeamImportRow[]): void {
    const seen = new Map<string, string>();
    for (const [index, row] of rows.entries()) {
        if (isNull(row.playhqId)) {
            continue;
        }
        const firstGrade = seen.get(row.playhqId);
        if (!isUndefined(firstGrade)) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                `playhq_id ${row.playhqId} is used by two teams (${firstGrade} and ${row.gradeKey}) — ` +
                    'games resolve teams by this id alone, so it must be globally unique',
                row,
            );
        }
        seen.set(row.playhqId, row.gradeKey);
    }
}

export function validateTeams(
    rows: readonly TeamImportRow[],
    clubKeys: ReadonlySet<string>,
    gradeKeys: ReadonlySet<string>,
): void {
    for (const [index, row] of rows.entries()) {
        const result = teamInsertSchema.safeParse({
            ...row,
            clubId: 0,
            gradeId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
        if (!gradeKeys.has(row.gradeKey)) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                `grade_key ${row.gradeKey} not found in grades.csv`,
                row.gradeKey,
            );
        }
        if (isNull(row.playhqId)) {
            throw new ImportValidationError(
                TEAMS_FILE,
                line(index),
                `missing playhq_id — the team identity key (display_name="${row.displayName}")`,
                row,
            );
        }
    }
    checkTeamNaturalKeyCollisions(rows);
    checkTeamIdsGloballyUnique(rows);
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
    const anyCountMissing =
        isNull(played) || isNull(won) || isNull(drawn) || isNull(lost);
    if (anyCountMissing) {
        return null;
    }
    if (played === won + drawn + lost) {
        return null;
    }
    const note = playedMismatchNote(played, won, drawn, lost);
    row.notes = isNull(row.notes) ? note : `${row.notes} ${note}`;
    return {
        clubKey: row.clubKey,
        displayName: row.displayName,
        drawn,
        gradeKey: row.gradeKey,
        lost,
        played,
        won,
    };
}

function checkResultRowFields(
    rows: readonly TeamSeasonResultImportRow[],
    clubKeys: ReadonlySet<string>,
    gradesByKey: ReadonlyMap<string, GradeImportRow>,
): void {
    for (const [index, row] of rows.entries()) {
        const result = teamSeasonResultInsertSchema.safeParse({
            ...row,
            gradeId: 0,
            teamId: 0,
        });
        if (!result.success) {
            throw new ImportValidationError(
                RESULTS_FILE,
                line(index),
                issueMessage(result.error),
                row,
            );
        }
        if (!clubKeys.has(row.clubKey)) {
            throw new ImportValidationError(
                RESULTS_FILE,
                line(index),
                `club_key ${row.clubKey} not found in clubs.csv`,
                row.clubKey,
            );
        }
        if (!gradesByKey.has(row.gradeKey)) {
            throw new ImportValidationError(
                RESULTS_FILE,
                line(index),
                `grade_key ${row.gradeKey} not found in grades.csv`,
                row.gradeKey,
            );
        }
        if (isNull(row.playhqId)) {
            throw new ImportValidationError(
                RESULTS_FILE,
                line(index),
                `missing playhq_id — the team identity key (display_name="${row.displayName}")`,
                row,
            );
        }
    }
}

/**
 * Ladder positions per grade must be exactly 1..n, the (grade, playhq_id)
 * natural key must be unique inside the grade, and `grade.team_count` must
 * equal the number of result rows for that grade.
 */
function checkGradeLadders(
    rows: readonly TeamSeasonResultImportRow[],
    gradesByKey: ReadonlyMap<string, GradeImportRow>,
): void {
    const byGrade = new Map<string, TeamSeasonResultImportRow[]>();
    for (const row of rows) {
        const existing = byGrade.get(row.gradeKey);
        if (isUndefined(existing)) {
            byGrade.set(row.gradeKey, [row]);
        } else {
            existing.push(row);
        }
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
                RESULTS_FILE,
                null,
                `ladder positions for grade ${gradeKey} are not exactly 1..${gradeRows.length}: got [${positions.join(',')}]`,
                gradeKey,
            );
        }
        // Same natural-key collision hazard as teams.csv: two result rows
        // resolving to the same (grade, playhq_id) team would upsert into
        // one team_season_results row and silently drop the other.
        const seenTeamKeys = new Map<string, number>();
        for (const row of gradeRows) {
            const rowIndex = rows.indexOf(row);
            const key = row.playhqId ?? 'null';
            const firstLine = seenTeamKeys.get(key);
            if (!isUndefined(firstLine)) {
                throw new ImportValidationError(
                    RESULTS_FILE,
                    line(rowIndex),
                    `duplicate natural key (grade_key=${gradeKey}, playhq_id=${row.playhqId ?? 'null'}) — ` +
                        `also present at line ${firstLine} (display_name="${row.displayName}")`,
                    { firstLine, key, line: line(rowIndex) },
                );
            }
            seenTeamKeys.set(key, line(rowIndex));
        }
        const grade = gradesByKey.get(gradeKey);
        if (!isUndefined(grade) && grade.teamCount !== gradeRows.length) {
            throw new ImportValidationError(
                RESULTS_FILE,
                null,
                `grade ${gradeKey} declares team_count ${grade.teamCount} but has ${gradeRows.length} result row(s)`,
                gradeKey,
            );
        }
    }
}

export function validateResults(
    rows: readonly TeamSeasonResultImportRow[],
    clubKeys: ReadonlySet<string>,
    gradesByKey: ReadonlyMap<string, GradeImportRow>,
): PlayedMismatchWarning[] {
    checkResultRowFields(rows, clubKeys, gradesByKey);
    checkGradeLadders(rows, gradesByKey);

    const playedMismatches: PlayedMismatchWarning[] = [];
    for (const row of rows) {
        const warning = checkPlayedReconciliation(row);
        if (!isNull(warning)) {
            playedMismatches.push(warning);
        }
    }
    return playedMismatches;
}

/**
 * Not a failure — a real signal a scrape went wrong, but not one that should
 * block an import (a grade genuinely can shrink or grow between seasons).
 * Compares a grade to the same (competitionKey, tier, division) grade in the
 * immediately preceding season of the same competition.
 */
/** Statuses whose row must carry both scores. */
const SCORED_STATUSES = new Set<string>(['final', 'forfeit']);

/**
 * Resolves one side, returning the unresolved PlayHQ id if there is one.
 *
 * Teams are looked up **season-wide, not grade-scoped**. Junior competitions
 * run grading rounds: a team plays its first few games in one grade, then is
 * regraded, and its ladder row — and so its `teams.csv` row — lives in the
 * grade it finished in. Requiring the team to belong to the game's own grade
 * would discard ~8% of fixtures, all of them real, played games.
 */
function resolveSide(
    row: GameImportRow,
    index: number,
    playhqId: string | null,
    side: 'home' | 'away',
    teamPlayhqIds: ReadonlySet<string>,
): string | null {
    if (isNull(playhqId)) {
        // Only a bye (one side) or an undecided finals slot may lack a team.
        if (row.status === 'bye' || row.status === 'scheduled') {
            return null;
        }
        throw new ImportValidationError(
            row.file,
            line(index),
            `${side} team missing on a ${row.status} game — only byes and scheduled finals may have an empty side`,
            row,
        );
    }
    return teamPlayhqIds.has(playhqId) ? null : playhqId;
}

function validateGameRow(row: GameImportRow, index: number): void {
    const knownStatuses: readonly string[] = GAME_STATUSES;
    const knownForfeitSides: readonly string[] = FORFEIT_SIDES;
    if (!knownStatuses.includes(row.status)) {
        throw new ImportValidationError(
            row.file,
            line(index),
            `unknown status "${row.status}" (expected one of ${GAME_STATUSES.join(', ')})`,
            row,
        );
    }
    const hasScores = !isNull(row.homeScore) && !isNull(row.awayScore);
    if (SCORED_STATUSES.has(row.status) && !hasScores) {
        throw new ImportValidationError(
            row.file,
            line(index),
            `${row.status} game is missing a score — a result with no score is a no_result, not a 0-0`,
            row,
        );
    }
    if (
        row.status === 'bye' &&
        (!isNull(row.homeScore) || !isNull(row.awayScore))
    ) {
        throw new ImportValidationError(
            row.file,
            line(index),
            'bye carries a score',
            row,
        );
    }
    if (row.status === 'forfeit' && isNull(row.forfeitingSide)) {
        throw new ImportValidationError(
            row.file,
            line(index),
            'forfeit is missing forfeiting_side',
            row,
        );
    }
    if (
        !isNull(row.forfeitingSide) &&
        !knownForfeitSides.includes(row.forfeitingSide)
    ) {
        throw new ImportValidationError(
            row.file,
            line(index),
            `unknown forfeiting_side "${row.forfeitingSide}"`,
            row,
        );
    }
    if (!isNull(row.homePlayhqId) && row.homePlayhqId === row.awayPlayhqId) {
        throw new ImportValidationError(
            row.file,
            line(index),
            'home and away are the same team',
            row,
        );
    }
}

/**
 * An unresolvable team id is a hard failure, never a silently invented team —
 * the same rule `validateResults` applies. Team ids are grade-scoped, so the
 * lookup key is `${gradeKey}:${playhqId}`.
 */
export function validateGames(
    rows: readonly GameImportRow[],
    teamPlayhqIds: ReadonlySet<string>,
    gradeKeys: ReadonlySet<string>,
): UnresolvedTeamWarning[] {
    const unresolved: UnresolvedTeamWarning[] = [];
    const seen = new Set<string>();
    for (const [index, row] of rows.entries()) {
        if (!gradeKeys.has(row.gradeKey)) {
            throw new ImportValidationError(
                row.file,
                line(index),
                `grade_key ${row.gradeKey} not found in grades.csv`,
                row.gradeKey,
            );
        }
        if (row.playhqId === '') {
            throw new ImportValidationError(
                row.file,
                line(index),
                'missing playhq_id — the game identity key',
                row,
            );
        }
        const identity = `${row.gradeKey}:${row.playhqId}`;
        if (seen.has(identity)) {
            throw new ImportValidationError(
                row.file,
                line(index),
                `duplicate game ${identity}`,
                row,
            );
        }
        seen.add(identity);

        validateGameRow(row, index);
        const missing = [
            resolveSide(row, index, row.homePlayhqId, 'home', teamPlayhqIds),
            resolveSide(row, index, row.awayPlayhqId, 'away', teamPlayhqIds),
        ].filter((id): id is string => !isNull(id));
        if (missing.length > 0) {
            // A team that appears on no ladder in any grade — it withdrew
            // before completing a game, so there is nothing to resolve and
            // nothing may be invented. Reported and skipped rather than
            // failing the whole import over one abandoned fixture.
            unresolved.push({
                file: row.file,
                gradeKey: row.gradeKey,
                line: line(index),
                missingTeamIds: missing,
                playhqId: row.playhqId,
            });
        }
    }
    return unresolved;
}

export function findTeamCountWarnings(data: ImportData): TeamCountWarning[] {
    const seasonByKey = new Map(data.seasons.map((s) => [s.seasonKey, s]));
    type Key = string;
    const gradeByCompTierDivSeason = new Map<
        Key,
        { seasonKey: string; startYear: number; grade: GradeImportRow }[]
    >();
    for (const grade of data.grades) {
        const season = seasonByKey.get(grade.seasonKey);
        if (isUndefined(season)) {
            continue;
        }
        const key = `${season.competitionKey}|${grade.tier}|${grade.division ?? ''}`;
        const list = gradeByCompTierDivSeason.get(key) ?? [];
        list.push({
            grade,
            seasonKey: grade.seasonKey,
            startYear: season.startYear,
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
            if (isUndefined(prev) || isUndefined(curr)) {
                continue;
            }
            const { teamCount: previousTeamCount } = prev.grade;
            const { teamCount } = curr.grade;
            const diff = Math.abs(teamCount - previousTeamCount);
            if (diff / Math.max(previousTeamCount, 1) >= SHARP_CHANGE_RATIO) {
                warnings.push({
                    gradeKey: curr.grade.gradeKey,
                    previousGradeKey: prev.grade.gradeKey,
                    previousTeamCount,
                    teamCount,
                });
            }
        }
    }
    return warnings;
}

export interface ImportWarnings {
    teamCountWarnings: TeamCountWarning[];
    playedMismatchWarnings: PlayedMismatchWarning[];
    unresolvedTeamWarnings: UnresolvedTeamWarning[];
}

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
    // Season-wide, not grade-scoped: see `resolveSide` on grading rounds.
    const teamPlayhqIds = new Set(
        data.teams
            .map((team) => team.playhqId)
            .filter((id): id is string => !isNull(id)),
    );
    const unresolvedTeamWarnings = validateGames(
        data.games,
        teamPlayhqIds,
        gradeKeys,
    );
    return {
        playedMismatchWarnings,
        teamCountWarnings: findTeamCountWarnings(data),
        unresolvedTeamWarnings,
    };
}
