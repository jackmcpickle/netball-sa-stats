import { join, resolve } from 'node:path';
import { isNull } from 'es-toolkit';
import { describe, expect, it } from 'vitest';
import { loadImportData } from '@/pipeline/import/run';
import { validateImportData } from '@/pipeline/import/validate';

const competitionKeys = new Set([
    'amnd',
    'premier_league',
    'premier_league_reserves',
    'city_night_division',
    'super_league',
    'juniors',
    'saucna',
    'suna',
    'elizabeth',
    'sammna',
    'sadna',
    'hills',
]);

describe('archive CSV import smoke', () => {
    it('validates merged archive rows through the existing import path', async () => {
        const root = resolve(import.meta.dirname, '../../..');
        const data = await loadImportData(join(root, 'data'));

        expect(() => {
            validateImportData(data, competitionKeys);
        }).not.toThrow();

        const archiveSeasons = data.seasons.filter(
            (season) => season.source === 'archive_pdf',
        );
        const archiveResults = data.results.filter(
            (result) => result.source === 'archive_pdf',
        );

        expect(archiveSeasons).toHaveLength(16);
        expect(archiveResults).toHaveLength(4965);
        expect(archiveResults.every((row) => isNull(row.played))).toBeTruthy();
        expect(
            archiveResults.every(
                (row) =>
                    row.placementBasis === 'final_premiership_placings' &&
                    row.positionUncertain === row.ladderPosition <= 4,
            ),
        ).toBeTruthy();
    });
});
