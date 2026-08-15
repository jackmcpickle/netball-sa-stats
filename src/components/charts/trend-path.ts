/**
 * Pure trend-series helpers, kept out of the component module so the chart
 * file exports components only.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { NO_VALUE } from '@/components/format';
import type { ClubTrendPoint } from '@/server/dto/club-profile.dto';

/**
 * Split a club's trend into unbroken runs of measured seasons. A season with no
 * measurable strength — or a hole in the calendar — ends the run, so the line
 * never interpolates across a season the club did not play.
 */
export function strengthPath(
    points: readonly ClubTrendPoint[],
): readonly (readonly ClubTrendPoint[])[] {
    const segments: ClubTrendPoint[][] = [];
    let current: ClubTrendPoint[] = [];
    for (const point of points) {
        const previous = current.at(-1);
        const brokenCalendar =
            !isUndefined(previous) && point.year - previous.year > 1;
        if (isNull(point.strength) || brokenCalendar) {
            if (current.length > 0) {
                segments.push(current);
            }
            current = [];
            if (isNull(point.strength)) {
                continue;
            }
        }
        current.push(point);
    }
    if (current.length > 0) {
        segments.push(current);
    }
    return segments;
}

export function formatStrength(strength: number | null): string {
    return isNull(strength) ? NO_VALUE : strength.toFixed(3);
}

/**
 * Screen-reader line for a single season slot. A null strength has two
 * distinct causes the copy must not conflate: the club fielded no teams that
 * year, or it fielded teams but none produced a measurable finish (a
 * one-team grade, or a position outside the grade's field size).
 */
export function describeTrendSlot(
    point: ClubTrendPoint | undefined,
    year: number,
): string {
    if (!point) {
        return `${String(year)}: ${NO_VALUE}`;
    }
    if (isNull(point.strength)) {
        const cause =
            point.teams === 0 ? 'no teams fielded' : 'no measurable finish';
        return `${String(point.year)}: ${cause}, strength ${NO_VALUE}`;
    }
    return `${String(point.year)}: strength ${formatStrength(point.strength)} from ${String(point.teams)} ${point.teams === 1 ? 'team' : 'teams'}.`;
}
