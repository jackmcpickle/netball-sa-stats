/**
 * Hit-testing helpers for chart tooltips. Pure so the nearest-point math can
 * be unit-tested without DOM or React.
 */

export interface ChartHit {
    /** Stable key for React lists and active-state matching. */
    readonly id: string;
    /** Series / club / category label shown as the tooltip title. */
    readonly label: string;
    /** Value line under the label, e.g. "2024 · #3". */
    readonly detail: string;
    /** Position in SVG viewBox units. */
    readonly x: number;
    readonly y: number;
}

/**
 * Convert a mouse event into SVG viewBox coordinates for an element inside
 * the target SVG. Returns null when the SVG has no screen CTM yet (detached
 * or not laid out).
 */
export function pointerToSvgPoint(
    svg: SVGSVGElement,
    clientX: number,
    clientY: number,
): { readonly x: number; readonly y: number } | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) {
        return null;
    }
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
}

/**
 * Nearest plotted hit within `maxDistance` (viewBox units). Distance is
 * Euclidean so a close year on another series still wins over a far year on
 * the hovered series.
 */
export function nearestHit(
    hits: readonly ChartHit[],
    x: number,
    y: number,
    maxDistance: number,
): ChartHit | null {
    let best: ChartHit | null = null;
    let bestDistance = maxDistance;
    for (const hit of hits) {
        const dx = hit.x - x;
        const dy = hit.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance <= bestDistance) {
            best = hit;
            bestDistance = distance;
        }
    }
    return best;
}
