/**
 * The domain object for "what years/seasons does the site hold data for".
 * `coveredYears`/`rankedYears` used to live as free functions in
 * `src/db/queries/coverage.ts`; that logic now lives here, and the query
 * module delegates to it so `buildCoverage`'s DTO shape is unaffected.
 */
import type { DomainError, Result } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';

export interface SeasonRow {
    readonly seasonId: number;
    readonly seasonKey: string;
    readonly startYear: number;
    readonly isFinal: boolean;
    readonly source: string;
    readonly competitionKey: string;
    readonly competitionName: string;
}

export class Coverage {
    private readonly rows: readonly SeasonRow[];

    private constructor(rows: readonly SeasonRow[]) {
        this.rows = rows;
    }

    public static from(rows: readonly SeasonRow[]): Coverage {
        return new Coverage(rows);
    }

    /** Every year the site holds any data for, ascending. */
    public years(): readonly number[] {
        return [...new Set(this.rows.map((row) => row.startYear))].sort(
            (a, b) => a - b,
        );
    }

    /**
     * A year is rankable only when every competition that ran it has
     * finished. One in-progress season would make the championship a partial
     * count, which is worse than no championship at all.
     */
    public rankedYears(): readonly number[] {
        return this.years().filter((year) => {
            const inYear = this.rows.filter((row) => row.startYear === year);
            return (
                inYear.some((row) => row.isFinal) &&
                inYear.every((row) => row.isFinal)
            );
        });
    }

    /** The most recent ranked year, or `no-ranked-seasons` instead of throwing. */
    public latestRankedYear(): Result<number, DomainError> {
        const year = this.rankedYears().at(-1);
        return year === undefined
            ? err({ kind: 'no-ranked-seasons' })
            : ok(year);
    }

    /**
     * Picks the year a caller should use: the requested year when it's
     * actually covered, otherwise the latest covered year — exactly today's
     * fallback behaviour. Returns `undefined` only when the dataset is
     * genuinely empty; an unknown/out-of-range request still resolves to a
     * real year. (`years()` is empty only when `rankedYears()` is too, so
     * there is no separate ranked-year fallback to fall back to.)
     */
    public resolveYear(requested?: number): number | undefined {
        const years = this.years();
        if (requested !== undefined && years.includes(requested)) {
            return requested;
        }
        return years.at(-1);
    }
}
