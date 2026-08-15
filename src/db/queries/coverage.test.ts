import { describe, expect, it } from 'vitest';
import { coverageChangeNote } from '@/db/queries/coverage';
import type { SeasonRow } from '@/db/queries/seasons';

function row(overrides: Partial<SeasonRow> & { startYear: number }): SeasonRow {
    return {
        seasonId: 1,
        seasonKey: `s-${String(overrides.startYear)}`,
        isFinal: true,
        source: 'playhq',
        competitionKey: 'amnd',
        competitionName: 'AMND',
        ...overrides,
    };
}

describe(coverageChangeNote, () => {
    it('is null when every competition is present from the first year', () => {
        const rows = [
            row({ startYear: 2020, competitionKey: 'amnd' }),
            row({ startYear: 2021, competitionKey: 'amnd' }),
        ];
        expect(coverageChangeNote(rows)).toBeNull();
    });

    it('is null for an empty dataset', () => {
        expect(coverageChangeNote([])).toBeNull();
    });

    it('reports the earliest year a new competition joined, and which one', () => {
        const rows = [
            row({ startYear: 2018, competitionKey: 'amnd' }),
            row({ startYear: 2019, competitionKey: 'amnd' }),
            row({
                startYear: 2020,
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
            }),
        ];
        expect(coverageChangeNote(rows)).toStrictEqual({
            year: 2020,
            addedCompetitions: ['Premier League'],
        });
    });

    it('groups multiple competitions that joined in the same change year', () => {
        const rows = [
            row({ startYear: 2018, competitionKey: 'amnd' }),
            row({
                startYear: 2020,
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
            }),
            row({
                startYear: 2020,
                competitionKey: 'premier_league_reserves',
                competitionName: 'PL Reserves (raw)',
            }),
        ];
        const note = coverageChangeNote(rows);
        expect(note?.year).toBe(2020);
        expect([...(note?.addedCompetitions ?? [])].sort()).toStrictEqual([
            'PL Reserves',
            'Premier League',
        ]);
    });

    it('picks the earliest change year and ignores a competition that joins even later', () => {
        const rows = [
            row({ startYear: 2016, competitionKey: 'amnd' }),
            row({
                startYear: 2018,
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
            }),
            row({
                startYear: 2022,
                competitionKey: 'premier_league_reserves',
                competitionName: 'PL Reserves (raw)',
            }),
        ];
        const note = coverageChangeNote(rows);
        expect(note?.year).toBe(2018);
        expect(note?.addedCompetitions).toStrictEqual(['Premier League']);
    });
});
