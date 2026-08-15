import { describe, expect, it } from 'vitest';
import type { SeasonRow } from '@/db/queries/coverage';
import { Coverage } from '@/server/domain/coverage';

function row(overrides: Partial<SeasonRow> & { startYear: number }): SeasonRow {
    return {
        seasonId: overrides.startYear,
        seasonKey: `season-${String(overrides.startYear)}`,
        isFinal: true,
        source: 'playhq',
        competitionKey: 'amnd',
        competitionName: 'AMND',
        ...overrides,
    };
}

describe(Coverage, () => {
    it('years lists every covered year ascending', () => {
        const coverage = Coverage.from([
            row({ startYear: 2025 }),
            row({ startYear: 2023 }),
            row({ startYear: 2024 }),
        ]);
        expect(coverage.years()).toStrictEqual([2023, 2024, 2025]);
    });

    it('rankedYears excludes years with any non-final season', () => {
        const coverage = Coverage.from([
            row({ startYear: 2024, isFinal: true }),
            row({ startYear: 2025, isFinal: false }),
        ]);
        expect(coverage.rankedYears()).toStrictEqual([2024]);
    });

    it('resolveYear returns undefined only for an empty dataset', () => {
        const coverage = Coverage.from([]);
        expect(coverage.resolveYear()).toBeUndefined();
        expect(coverage.resolveYear(2024)).toBeUndefined();
    });

    it('resolveYear falls back to the latest year for an unknown request', () => {
        const coverage = Coverage.from([
            row({ startYear: 2024 }),
            row({ startYear: 2025 }),
        ]);
        expect(coverage.resolveYear(1999)).toBe(2025);
        expect(coverage.resolveYear()).toBe(2025);
        expect(coverage.resolveYear(2024)).toBe(2024);
    });

    it('latestRankedYear errs with no-ranked-seasons instead of throwing', () => {
        const coverage = Coverage.from([
            row({ startYear: 2025, isFinal: false }),
        ]);
        const result = coverage.latestRankedYear();
        expect(result).toStrictEqual({
            ok: false,
            error: { kind: 'no-ranked-seasons' },
        });
    });

    it('latestRankedYear returns the latest ranked year on success', () => {
        const coverage = Coverage.from([
            row({ startYear: 2024, isFinal: true }),
            row({ startYear: 2025, isFinal: true }),
        ]);
        const result = coverage.latestRankedYear();
        expect(result).toStrictEqual({ ok: true, value: 2025 });
    });
});
