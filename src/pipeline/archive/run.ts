import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
    buildArchiveEntities,
    loadArchivePlacements,
    mergeArchiveEntitiesIntoData,
} from '@/pipeline/archive/merge';
import type { ArchiveEntities } from '@/pipeline/archive/merge';
import type { ClubAliasRow } from '@/pipeline/archive/resolve';
import { ARCHIVE_YEARS } from '@/pipeline/archive/sources';
import { parseCsv, toCsv } from '@/pipeline/csv';

export interface RunArchiveBackfillOptions {
    rootDir: string;
    years?: readonly number[];
}

export interface ArchiveBackfillReport {
    seasons: number;
    grades: number;
    teams: number;
    results: number;
}

async function loadClubAliases(dataDir: string): Promise<ClubAliasRow[]> {
    const text = await readFile(join(dataDir, 'club_aliases.csv'), 'utf-8');
    return parseCsv(text).map((row) => ({
        club_key: row.club_key ?? '',
        alias_text: row.alias_text ?? '',
        source: row.source ?? '',
    }));
}

async function writeStagingCsvs(
    archiveDir: string,
    entities: ArchiveEntities,
): Promise<void> {
    await writeFile(join(archiveDir, 'seasons.csv'), toCsv(entities.seasons));
    await writeFile(join(archiveDir, 'grades.csv'), toCsv(entities.grades));
    await writeFile(join(archiveDir, 'teams.csv'), toCsv(entities.teams));
    await writeFile(
        join(archiveDir, 'team_season_results.csv'),
        toCsv(entities.results),
    );
}

export async function runArchiveBackfill(
    options: RunArchiveBackfillOptions,
): Promise<ArchiveBackfillReport> {
    const rootDir = resolve(options.rootDir);
    const dataDir = join(rootDir, 'data');
    const archiveDir = join(dataDir, 'archive');
    const placementsDir = join(archiveDir, 'placements');
    const years = options.years ?? ARCHIVE_YEARS;
    const [placements, clubAliases] = await Promise.all([
        loadArchivePlacements(placementsDir, years),
        loadClubAliases(dataDir),
    ]);
    const entities = buildArchiveEntities({ placements, clubAliases });

    await writeStagingCsvs(archiveDir, entities);
    await mergeArchiveEntitiesIntoData(dataDir, entities);

    return {
        seasons: entities.seasons.length,
        grades: entities.grades.length,
        teams: entities.teams.length,
        results: entities.results.length,
    };
}
