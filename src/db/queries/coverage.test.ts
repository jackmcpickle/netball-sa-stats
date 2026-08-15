import { describe, expect, it } from 'vitest';
import { coverageChangeNote } from '@/db/queries/coverage';
import type { SeasonRow } from '@/db/queries/seasons';

function row(overrides: Partial<SeasonRow> & { startYear: number }): SeasonRow {
    return {
        competitionKey: 'amnd',
        competitionName: 'AMND',
        isFinal: true,
        seasonId: 1,
        seasonKey: `s-${String(overrides.startYear)}`,
        source: 'playhq',
        ...overrides,
    };
}

describe(coverageChangeNote, () => {
    it('is null when every competition is present from the first year', () => {
        const rows = [
            row({ competitionKey: 'amnd', startYear: 2020 }),
            row({ competitionKey: 'amnd', startYear: 2021 }),
        ];
        expect(coverageChangeNote(rows)).toBeNull();
    });

    it('is null for an empty dataset', () => {
        expect(coverageChangeNote([])).toBeNull();
    });

    it('reports the earliest year a new competition joined, and which one', () => {
        const rows = [
            row({ competitionKey: 'amnd', startYear: 2018 }),
            row({ competitionKey: 'amnd', startYear: 2019 }),
            row({
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
                startYear: 2020,
            }),
        ];
        expect(coverageChangeNote(rows)).toStrictEqual({
            addedCompetitions: ['Premier League'],
            year: 2020,
        });
    });

    it('groups multiple competitions that joined in the same change year', () => {
        const rows = [
            row({ competitionKey: 'amnd', startYear: 2018 }),
            row({
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
                startYear: 2020,
            }),
            row({
                competitionKey: 'premier_league_reserves',
                competitionName: 'PL Reserves (raw)',
                startYear: 2020,
            }),
        ];
        const note = coverageChangeNote(rows);
        expect(note?.year).toBe(2020);
        expect((note?.addedCompetitions ?? []).toSorted()).toStrictEqual([
            'PL Reserves',
            'Premier League',
        ]);
    });

    it('picks the earliest change year and ignores a competition that joins even later', () => {
        const rows = [
            row({ competitionKey: 'amnd', startYear: 2016 }),
            row({
                competitionKey: 'premier_league',
                competitionName: 'Premier League',
                startYear: 2018,
            }),
            row({
                competitionKey: 'premier_league_reserves',
                competitionName: 'PL Reserves (raw)',
                startYear: 2022,
            }),
        ];
        const note = coverageChangeNote(rows);
        expect(note?.year).toBe(2018);
        expect(note?.addedCompetitions).toStrictEqual(['Premier League']);
    });
});
