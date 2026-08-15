import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mapArchiveGradeName } from '@/pipeline/archive/grade-map';
import {
    createArchiveClubResolver,
    syntheticArchivePlayhqId,
} from '@/pipeline/archive/resolve';
import type { ClubAliasRow } from '@/pipeline/archive/resolve';
import { parseCsv, toCsv } from '@/pipeline/csv';

type CsvRow = Record<string, string | number | null>;

export type PlacementTeam = {
    ladderPosition: number;
    teamName: string;
    squadNumber: number | null;
};

export type PlacementGrade = {
    gradeName: string;
    teams: readonly PlacementTeam[];
};

export type PlacementSeason = {
    year: number;
    grades: readonly PlacementGrade[];
};

export type ArchiveEntities = {
    seasons: CsvRow[];
    grades: CsvRow[];
    teams: CsvRow[];
    results: CsvRow[];
};

export type BuildArchiveEntitiesOptions = {
    placements: readonly PlacementSeason[];
    clubAliases: readonly ClubAliasRow[];
};

const ARCHIVE_RESULT_NULL_STATS = {
    played: null,
    won: null,
    drawn: null,
    lost: null,
    byes: null,
    goals_for: null,
    goals_against: null,
    goal_difference: null,
    points: null,
    percentage: null,
    shots_attempted: null,
    shots_scored: null,
} as const;

function seasonKey(year: number): string {
    return `amnd-winter-${String(year)}`;
}

function finalPlacingsNote(year: number): string | null {
    return year >= 2000 && year <= 2005
        ? 'Archive PDF title: Final Placings'
        : null;
}

function assertContiguousPositions(
    grade: PlacementGrade,
    season: PlacementSeason,
): void {
    grade.teams.forEach((team, index) => {
        const expected = index + 1;
        if (team.ladderPosition !== expected) {
            throw new Error(
                `Archive placements for ${String(season.year)} ${grade.gradeName} are not contiguous at row ${String(expected)}: found ${String(team.ladderPosition)}`,
            );
        }
    });
}

export function buildArchiveEntities(
    options: BuildArchiveEntitiesOptions,
): ArchiveEntities {
    const resolver = createArchiveClubResolver(options.clubAliases);
    const seasons: CsvRow[] = [];
    const grades: CsvRow[] = [];
    const teams: CsvRow[] = [];
    const results: CsvRow[] = [];

    for (const season of options.placements) {
        const currentSeasonKey = seasonKey(season.year);
        seasons.push({
            competition_key: 'amnd',
            season_key: currentSeasonKey,
            competition_period: 'winter',
            label: `Winter ${String(season.year)}`,
            start_year: season.year,
            end_year: season.year,
            is_final: 1,
            playhq_id: `archive:${currentSeasonKey}`,
            source: 'archive_pdf',
            status: 'completed',
        });

        for (const grade of season.grades) {
            assertContiguousPositions(grade, season);
            const mappedGrade = mapArchiveGradeName(
                grade.gradeName,
                season.year,
            );
            const gradeKey = `${currentSeasonKey}-${mappedGrade.slug}`;
            grades.push({
                season_key: currentSeasonKey,
                grade_key: gradeKey,
                name: mappedGrade.displayName,
                tier: mappedGrade.tier,
                division: mappedGrade.division,
                team_count: grade.teams.length,
                age_band: mappedGrade.ageBand,
                playhq_id: `archive:${currentSeasonKey}:${mappedGrade.slug}`,
            });

            for (const team of grade.teams) {
                const clubKey = resolver.resolve(team.teamName, {
                    year: season.year,
                    gradeName: grade.gradeName,
                    ladderPosition: team.ladderPosition,
                });
                const playhqId = syntheticArchivePlayhqId({
                    seasonKey: currentSeasonKey,
                    gradeSlug: mappedGrade.slug,
                    clubKey,
                    squadNumber: team.squadNumber,
                });
                teams.push({
                    club_key: clubKey,
                    grade_key: gradeKey,
                    display_name: team.teamName,
                    squad_number: team.squadNumber,
                    playhq_id: playhqId,
                });
                results.push({
                    grade_key: gradeKey,
                    club_key: clubKey,
                    squad_number: team.squadNumber,
                    playhq_id: playhqId,
                    display_name: team.teamName,
                    ladder_position: team.ladderPosition,
                    position_uncertain: team.ladderPosition <= 4 ? 1 : 0,
                    ...ARCHIVE_RESULT_NULL_STATS,
                    source: 'archive_pdf',
                    placement_basis: 'final_premiership_placings',
                    notes: finalPlacingsNote(season.year),
                    scraped_at: null,
                });
            }
        }
    }

    return { seasons, grades, teams, results };
}

async function readCsvRows(
    dataDir: string,
    filename: string,
): Promise<CsvRow[]> {
    const text = await readFile(join(dataDir, filename), 'utf-8');
    return parseCsv(text);
}

function mergeByKey(
    existing: readonly CsvRow[],
    archive: readonly CsvRow[],
    key: (row: CsvRow) => string,
    belongsToArchiveDomain: (row: CsvRow) => boolean,
    isExpectedArchiveRow: (row: CsvRow) => boolean,
): CsvRow[] {
    const archiveKeys = new Set(archive.map(key));
    const retained: CsvRow[] = [];
    for (const row of existing) {
        const rowKey = key(row);
        if (belongsToArchiveDomain(row)) {
            if (!isExpectedArchiveRow(row)) {
                throw new Error(
                    `Archive merge would remove non-archive row ${rowKey}`,
                );
            }
            continue;
        }
        if (archiveKeys.has(rowKey)) {
            throw new Error(
                `Archive row would clobber non-archive key ${rowKey}`,
            );
        }
        retained.push(row);
    }
    return [...retained, ...archive];
}

async function writeCsvRows(
    dataDir: string,
    filename: string,
    rows: readonly CsvRow[],
): Promise<void> {
    await writeFile(join(dataDir, filename), toCsv(rows));
}

export async function mergeArchiveEntitiesIntoData(
    dataDir: string,
    entities: ArchiveEntities,
): Promise<void> {
    const archiveSeasonKeys = new Set(
        entities.seasons.map((row) => String(row.season_key)),
    );
    const archiveGradeKeys = new Set(
        entities.grades.map((row) => String(row.grade_key)),
    );

    const seasons = mergeByKey(
        await readCsvRows(dataDir, 'seasons.csv'),
        entities.seasons,
        (row) => String(row.season_key),
        (row) => row.source === 'archive_pdf',
        (row) => row.source === 'archive_pdf',
    );
    const grades = mergeByKey(
        await readCsvRows(dataDir, 'grades.csv'),
        entities.grades,
        (row) => String(row.grade_key),
        (row) => archiveSeasonKeys.has(String(row.season_key)),
        (row) => archiveSeasonKeys.has(String(row.season_key)),
    );
    const teams = mergeByKey(
        await readCsvRows(dataDir, 'teams.csv'),
        entities.teams,
        (row) => `${String(row.grade_key)}|${String(row.playhq_id)}`,
        (row) => archiveGradeKeys.has(String(row.grade_key)),
        (row) => archiveGradeKeys.has(String(row.grade_key)),
    );
    const results = mergeByKey(
        await readCsvRows(dataDir, 'team_season_results.csv'),
        entities.results,
        (row) => `${String(row.grade_key)}|${String(row.playhq_id)}`,
        (row) => archiveGradeKeys.has(String(row.grade_key)),
        (row) =>
            row.source === 'archive_pdf' &&
            archiveGradeKeys.has(String(row.grade_key)),
    );

    await writeCsvRows(dataDir, 'seasons.csv', seasons);
    await writeCsvRows(dataDir, 'grades.csv', grades);
    await writeCsvRows(dataDir, 'teams.csv', teams);
    await writeCsvRows(dataDir, 'team_season_results.csv', results);
}

export async function loadArchivePlacements(
    placementsDir: string,
    years: readonly number[],
): Promise<PlacementSeason[]> {
    return await Promise.all(
        years.map(async (year) => {
            const text = await readFile(
                resolve(placementsDir, `${String(year)}.json`),
                'utf-8',
            );
            return JSON.parse(text) as PlacementSeason;
        }),
    );
}
