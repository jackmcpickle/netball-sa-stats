import { isNil, isNull } from 'es-toolkit';
/**
 * Display formatting. Every "we do not have this" case resolves to an em dash
 * rather than a zero, so a missing figure is never mistaken for a real one.
 */

export const NO_VALUE = '—';

export function formatNumber(
    value: number | null | undefined,
    decimals = 0,
): string {
    if (isNil(value) || !Number.isFinite(value)) {
        return NO_VALUE;
    }
    return value.toFixed(decimals);
}

export function formatPercent(value: number | null | undefined): string {
    return isNil(value) ? NO_VALUE : `${value.toFixed(1)}%`;
}

/** `12–4–1`, or `12–4` when there were no draws. */
export function formatRecord(
    won: number | null,
    lost: number | null,
    drawn: number | null,
): string {
    if (isNull(won) || isNull(lost)) {
        return NO_VALUE;
    }
    const parts = [won, lost];
    if (!isNull(drawn) && drawn > 0) {
        parts.push(drawn);
    }
    return parts.map(String).join('–');
}

/** `4 of 10`, which is the only honest way to read a ladder position. */
export function formatPosition(position: number, teamCount: number): string {
    return `${String(position)} of ${String(teamCount)}`;
}

export interface Movement {
    readonly label: string;
    readonly description: string;
    readonly direction: 'up' | 'down' | 'level' | 'new';
}

/** Rank movement against the previous ranked season. Lower rank is better. */
export function describeMovement(
    rank: number,
    previousRank: number | null,
): Movement {
    if (isNull(previousRank)) {
        return {
            label: 'new',
            description: 'First ranked season',
            direction: 'new',
        };
    }
    const delta = previousRank - rank;
    if (delta > 0) {
        return {
            label: `▲ ${String(delta)}`,
            description: `Up ${String(delta)} ${delta === 1 ? 'place' : 'places'}`,
            direction: 'up',
        };
    }
    if (delta < 0) {
        const absDelta = Math.abs(delta);
        return {
            label: `▼ ${String(absDelta)}`,
            description: `Down ${String(absDelta)} ${absDelta === 1 ? 'place' : 'places'}`,
            direction: 'down',
        };
    }
    return { label: NO_VALUE, description: 'No change', direction: 'level' };
}
