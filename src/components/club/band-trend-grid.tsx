import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import {
    bandX,
    linePath,
    round,
    type LinePoint,
    type Plot,
} from '@/components/charts/scale';
import { strengthPath } from '@/components/charts/trend-chart';
import { NO_VALUE } from '@/components/format';
import type { AccentName, ClubBandTrend, ClubTrendPoint } from '@/data/types';

const PLOT: Plot = { x0: 3, x1: 237, y0: 5, y1: 51 };
const VIEW_BOX = '0 0 240 56';
/** The half-strength line, drawn so a band can be read as above or below par. */
const MIDLINE = 0.5;

/**
 * Every sparkline shares this axis. Fitting each band to its own range would
 * draw a bottom-of-the-grade band exactly like a dominant one, which is the
 * opposite of what a club comes to this panel to find out.
 */
function strengthY(strength: number): number {
    const clamped = Math.min(Math.max(strength, 0), 1);
    return round(PLOT.y1 - clamped * (PLOT.y1 - PLOT.y0), 2);
}

function formatStrength(strength: number | null): string {
    return strength === null ? NO_VALUE : strength.toFixed(3);
}

/**
 * Mean of a window of measured seasons. Comparing single endpoints lets one
 * fluke season (a debut last place, say) read as a dramatic swing, so both
 * ends of the trend are averaged over up to three seasons instead. Bands
 * with fewer than six measured seasons let the windows overlap — still more
 * robust than a two-point comparison.
 */
function windowMean(points: readonly ClubTrendPoint[]): number {
    const total = points.reduce((sum, point) => sum + (point.strength ?? 0), 0);
    return total / points.length;
}

export interface BandSummary {
    readonly tier: number;
    readonly label: string;
    readonly points: readonly ClubTrendPoint[];
    readonly measured: readonly ClubTrendPoint[];
    readonly latest: ClubTrendPoint;
    readonly first: ClubTrendPoint;
    readonly change: number | null;
    readonly windowSize: number;
}

/**
 * Words the number of seasons averaged into each end of the change figure
 * ("its first season" / "its first two measured seasons" / "its first three
 * measured seasons") so the caption never claims a window wider than what
 * was actually available.
 */
export function windowSizeLabel(windowSize: number): string {
    if (windowSize === 1) return 'its first season';
    if (windowSize === 2) return 'its first two measured seasons';
    return 'its first three measured seasons';
}

/**
 * Drop the bands the club never got a measurable result in, and precompute the
 * figures each cell prints. Tier order is set upstream (strongest first) and is
 * preserved here.
 */
export function bandSummaries(
    bands: readonly ClubBandTrend[],
): readonly BandSummary[] {
    return bands.flatMap((band): BandSummary[] => {
        const measured = band.points.filter((point) => point.strength !== null);
        const latest = measured.at(-1);
        const first = measured[0];
        if (!latest || !first) return [];
        const windowSize = Math.min(3, measured.length - 1);
        const startWindow = measured.slice(0, windowSize);
        const endWindow = measured.slice(measured.length - windowSize);
        return [
            {
                tier: band.tier,
                label: band.label,
                points: band.points,
                measured,
                latest,
                first,
                change:
                    measured.length > 1
                        ? round(
                              windowMean(endWindow) - windowMean(startWindow),
                              3,
                          )
                        : null,
                windowSize,
            },
        ];
    });
}

interface BandTrendGridProps {
    readonly bands: readonly ClubBandTrend[];
    readonly clubName: string;
    readonly accent: AccentName;
}

/**
 * Small multiples: one sparkline per grade band, strongest band first, so the
 * club-wide line above can be read as "up in Junior, flat in B, down in
 * Premier" rather than a single average that hides all three.
 *
 * Hand-rolled SVG for the same reason as the other charts here — a few dozen
 * static points that render on the server and cost nothing to hydrate.
 */
export function BandTrendGrid({
    bands,
    clubName,
    accent,
}: BandTrendGridProps): JSX.Element | null {
    const summaries = bandSummaries(bands);
    if (summaries.length === 0) return null;
    const stroke = accentText(accent);

    return (
        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.map((band) => {
                const count = band.points.length;
                return (
                    <li
                        key={band.tier}
                        className="rounded-card bg-paper-sunken p-4"
                    >
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-ink">
                                {band.label}
                            </span>
                            <span className="font-mono text-sm text-ink">
                                {formatStrength(band.latest.strength)}
                            </span>
                        </div>

                        <svg
                            viewBox={VIEW_BOX}
                            aria-hidden="true"
                            className="mt-2 block h-14 w-full"
                            preserveAspectRatio="none"
                        >
                            <line
                                x1={PLOT.x0}
                                x2={PLOT.x1}
                                y1={strengthY(MIDLINE)}
                                y2={strengthY(MIDLINE)}
                                className="stroke-rule-soft"
                                strokeWidth="1"
                            />
                            <g className={stroke}>
                                {strengthPath(band.points).map((segment) => {
                                    const head = segment[0];
                                    if (!head) return null;
                                    const line: LinePoint[] = segment.map(
                                        (point): LinePoint => ({
                                            x: bandX(
                                                band.points.indexOf(point),
                                                count,
                                                PLOT,
                                            ),
                                            y: strengthY(point.strength ?? 0),
                                        }),
                                    );
                                    return (
                                        <path
                                            key={`segment-${String(head.year)}`}
                                            d={linePath(line)}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                        />
                                    );
                                })}
                                {/*
                                    A dot per measured season, which is also
                                    what makes a band with a single season —
                                    a zero-length path — visible at all.
                                */}
                                {band.measured.map((point) => (
                                    <circle
                                        key={`dot-${String(point.year)}`}
                                        cx={bandX(
                                            band.points.indexOf(point),
                                            count,
                                            PLOT,
                                        )}
                                        cy={strengthY(point.strength ?? 0)}
                                        r="2"
                                        fill="currentColor"
                                    />
                                ))}
                            </g>
                        </svg>

                        <p className="mt-2 text-[13px] text-ink-muted">
                            {`${clubName} in ${band.label}: strength ${formatStrength(band.latest.strength)} in ${String(band.latest.year)} from ${String(band.latest.teams)} ${band.latest.teams === 1 ? 'team' : 'teams'}. ${
                                band.change === null
                                    ? 'One measured season.'
                                    : `${band.change > 0 ? 'Up' : band.change < 0 ? 'Down' : 'Level'} ${Math.abs(band.change).toFixed(3)} on ${windowSizeLabel(band.windowSize)}, across ${String(band.measured.length)} measured seasons.`
                            }`}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}
