import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { bandX, linePath, round } from '@/components/charts/scale';
import type { LinePoint, Plot } from '@/components/charts/scale';
import { strengthPath } from '@/components/charts/trend-path';
import type { BandSummary } from '@/components/club/band-summaries';
import {
    bandSummaries,
    windowSizeLabel,
} from '@/components/club/band-summaries';
import { NO_VALUE } from '@/components/format';
import type { ClubBandTrend } from '@/server/dto/club-profile.dto';
import type { AccentName } from '@/server/dto/shared.dto';

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

/** Direction word for a change figure; exact zero reads as "Level". */
function changeDirection(change: number): string {
    if (change > 0) {
        return 'Up';
    }
    if (change < 0) {
        return 'Down';
    }
    return 'Level';
}

/** The trailing sentence of a band caption: how the band has moved. */
function changeSentence(band: BandSummary): string {
    if (band.change === null) {
        return 'One measured season.';
    }
    const direction = changeDirection(band.change);
    const magnitude = Math.abs(band.change).toFixed(3);
    const window = windowSizeLabel(band.windowSize);
    const seasons = String(band.measured.length);
    return `${direction} ${magnitude} on ${window}, across ${seasons} measured seasons.`;
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
    if (summaries.length === 0) {
        return null;
    }
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
                                    const [head] = segment;
                                    if (!head) {
                                        return null;
                                    }
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
                            {`${clubName} in ${band.label}: strength ${formatStrength(band.latest.strength)} in ${String(band.latest.year)} from ${String(band.latest.teams)} ${band.latest.teams === 1 ? 'team' : 'teams'}. ${changeSentence(band)}`}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}
