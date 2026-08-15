/**
 * Chart scale maths. Pure and dependency-free so it can be unit-tested in the
 * default node environment, and so the SVG components stay declarative.
 *
 * There is no chart library: both charts are small, static per render, and
 * render identically on the server, which costs zero hydration.
 */

export interface Plot {
    /** Inner drawing area, in viewBox units. */
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
}

/** Round to `places` decimals. Keeps generated path strings short and stable. */
export function round(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

/**
 * Evenly spaced x positions, one per category. A single category sits at the
 * left edge rather than dividing by zero.
 */
export function bandX(index: number, count: number, plot: Plot): number {
    if (count <= 1) {
        return plot.x0;
    }
    return round(plot.x0 + (index * (plot.x1 - plot.x0)) / (count - 1), 2);
}

/**
 * Rank axis, inverted: rank 1 sits at the top. `worstRank` is the number of
 * ranked positions, so a 25-club championship spans #1 to #25.
 */
export function rankY(rank: number, worstRank: number, plot: Plot): number {
    if (worstRank <= 1) {
        return plot.y0;
    }
    const clamped = Math.min(Math.max(rank, 1), worstRank);
    return round(
        plot.y0 + ((clamped - 1) * (plot.y1 - plot.y0)) / (worstRank - 1),
        2,
    );
}

/**
 * Gridline ranks: #1, then every `step`th rank, always including the worst.
 * Guarantees the axis is labelled at both extremes.
 */
export function rankTicks(worstRank: number, step: number): number[] {
    if (worstRank < 1) {
        return [];
    }
    const ticks: number[] = [];
    for (let rank = 1; rank <= worstRank; rank += Math.max(1, step)) {
        ticks.push(rank);
    }
    if (ticks.at(-1) !== worstRank) {
        ticks.push(worstRank);
    }
    return ticks;
}

export interface LinePoint {
    readonly x: number;
    readonly y: number;
}

/**
 * Polyline path. Gaps in the input (a club that fielded no team that season)
 * break the line rather than being interpolated across, so an absent season
 * never reads as a plotted result.
 */
export function linePath(points: readonly (LinePoint | null)[]): string {
    let path = '';
    let penDown = false;
    for (const point of points) {
        if (!point) {
            penDown = false;
            continue;
        }
        const separator = path === '' ? '' : ' ';
        const command = penDown ? ' L' : `${separator}M`;
        path += `${command}${String(round(point.x, 2))} ${String(round(point.y, 2))}`;
        penDown = true;
    }
    return path;
}

/**
 * Bar height as a fraction of the tallest bar, in pixels. A zero or negative
 * maximum yields zero height rather than NaN.
 */
export function barHeight(
    value: number,
    max: number,
    trackHeight: number,
): number {
    if (max <= 0) {
        return 0;
    }
    return round(Math.max(0, value / max) * trackHeight, 1);
}
