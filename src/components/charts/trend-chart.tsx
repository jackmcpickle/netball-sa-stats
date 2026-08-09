import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import {
    bandX,
    barHeight,
    linePath,
    round,
    type LinePoint,
    type Plot,
} from '@/components/charts/scale';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';
import { NO_VALUE } from '@/components/format';
import type { AccentName, ClubTrendPoint } from '@/data/types';

const PLOT: Plot = { x0: 44, x1: 1180, y0: 16, y1: 236 };
const TEAMS_BASELINE = 300;
const TEAMS_TRACK = 48;
const LABEL_BASELINE = 322;
const VIEW_BOX = '0 0 1200 336';
const TICKS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

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
            previous !== undefined && point.year - previous.year > 1;
        if (point.strength === null || brokenCalendar) {
            if (current.length > 0) segments.push(current);
            current = [];
            if (point.strength === null) continue;
        }
        current.push(point);
    }
    if (current.length > 0) segments.push(current);
    return segments;
}

/** Strength runs bottom (0.00) to top (1.00) on a fixed axis — see below. */
function strengthY(strength: number, plot: Plot): number {
    const clamped = Math.min(Math.max(strength, 0), 1);
    return round(plot.y1 - clamped * (plot.y1 - plot.y0), 2);
}

function formatStrength(strength: number | null): string {
    return strength === null ? NO_VALUE : strength.toFixed(3);
}

interface TrendChartProps {
    readonly points: readonly ClubTrendPoint[];
    /** Names the series for assistive tech, e.g. "Matrics, all grades". */
    readonly title: string;
    readonly accent: AccentName;
}

/**
 * Club strength over time, with the number of teams fielded as a faint strip
 * sharing the x axis.
 *
 * The y axis is pinned to 0–1 rather than fitted to the data: strength is
 * already a bounded score, and an auto-scaled axis would turn a 0.02 wobble
 * into an apparent collapse for a club reading its own page.
 *
 * Hand-rolled for the same reasons as the rank movement chart: a few dozen
 * static points that cost nothing to render on the server.
 */
export function TrendChart({
    points,
    title,
    accent,
}: TrendChartProps): JSX.Element {
    const years = points.map((point) => point.year);
    const maxTeams = Math.max(1, ...points.map((point) => point.teams));
    const segments = strengthPath(points);
    const measured = points.filter((point) => point.strength !== null);

    return (
        <figure className="m-0">
            {/*
                The picture is hidden from assistive tech and replaced by the
                figures themselves: a described polyline is worse to listen to
                than the list it draws.
            */}
            <p className="sr-only">
                {`Line chart of ${title}: club strength on a fixed axis from 0.00 to 1.00, where 1.00 is top of every grade, with teams fielded shown beneath. The line breaks across seasons with no data. ${String(measured.length)} of ${String(points.length)} covered seasons have a measured strength.`}
            </p>
            <ul className="sr-only">
                {timelineSlots(years).map((slot) =>
                    slot.kind === 'gap' ? (
                        <li key={`gap-${String(slot.afterYear)}`}>
                            {`No season data for ${gapLabel(slot.missingYears)}.`}
                        </li>
                    ) : (
                        <li key={slot.year}>
                            {(() => {
                                const point = points.find(
                                    (candidate) => candidate.year === slot.year,
                                );
                                if (!point) {
                                    return `${String(slot.year)}: ${NO_VALUE}`;
                                }
                                return point.strength === null
                                    ? `${String(point.year)}: no teams fielded, strength ${NO_VALUE}`
                                    : `${String(point.year)}: strength ${formatStrength(point.strength)} from ${String(point.teams)} ${point.teams === 1 ? 'team' : 'teams'}.`;
                            })()}
                        </li>
                    ),
                )}
            </ul>

            <svg
                viewBox={VIEW_BOX}
                aria-hidden="true"
                className="block h-[330px] w-full"
            >
                {TICKS.map((tick) => {
                    const y = strengthY(tick, PLOT);
                    return (
                        <g key={tick}>
                            <line
                                x1={PLOT.x0}
                                x2={PLOT.x1}
                                y1={y}
                                y2={y}
                                className="stroke-rule-soft"
                                strokeWidth="1"
                            />
                            <text
                                x="0"
                                y={y + 4}
                                className="fill-ink-faint font-mono text-[11px]"
                            >
                                {tick.toFixed(2)}
                            </text>
                        </g>
                    );
                })}

                {timelineSlots(years).flatMap((slot, slotIndex, slots) => {
                    if (slot.kind !== 'gap') return [];
                    const prev = slots[slotIndex - 1];
                    const next = slots[slotIndex + 1];
                    if (prev?.kind !== 'year' || next?.kind !== 'year') {
                        return [];
                    }
                    const x =
                        (bandX(years.indexOf(prev.year), years.length, PLOT) +
                            bandX(
                                years.indexOf(next.year),
                                years.length,
                                PLOT,
                            )) /
                        2;
                    return [
                        <g key={`gap-${String(slot.afterYear)}`}>
                            <line
                                x1={x}
                                x2={x}
                                y1={PLOT.y0}
                                y2={TEAMS_BASELINE}
                                className="stroke-rule"
                                strokeWidth="1"
                                strokeDasharray="4 5"
                            />
                            <text
                                x={x}
                                y={LABEL_BASELINE}
                                textAnchor="middle"
                                className="fill-ink-faint font-mono text-[9px]"
                            >
                                {gapLabel(slot.missingYears)}
                            </text>
                        </g>,
                    ];
                })}

                {points.map((point, index) => {
                    const height = barHeight(
                        point.teams,
                        maxTeams,
                        TEAMS_TRACK,
                    );
                    const x = bandX(index, years.length, PLOT);
                    return (
                        <rect
                            key={`teams-${String(point.year)}`}
                            x={x - 7}
                            y={TEAMS_BASELINE - height}
                            width="14"
                            height={height}
                            rx="2"
                            className="fill-rule-soft"
                        />
                    );
                })}

                {points.map((point, index) =>
                    // Every other year is labelled at this width; the rest
                    // would collide.
                    index % 2 === 0 || index === points.length - 1 ? (
                        <text
                            key={`label-${String(point.year)}`}
                            x={bandX(index, years.length, PLOT)}
                            y={LABEL_BASELINE}
                            textAnchor="middle"
                            className="fill-ink-muted font-mono text-[11px]"
                        >
                            {point.year}
                        </text>
                    ) : null,
                )}

                <g className={accentText(accent)}>
                    {segments.map((segment) => {
                        const first = segment[0];
                        if (!first) return null;
                        const linePoints: LinePoint[] = segment.map(
                            (point): LinePoint => ({
                                x: bandX(
                                    years.indexOf(point.year),
                                    years.length,
                                    PLOT,
                                ),
                                y: strengthY(point.strength ?? 0, PLOT),
                            }),
                        );
                        return (
                            <path
                                key={`segment-${String(first.year)}`}
                                d={linePath(linePoints)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        );
                    })}
                    {/*
                        Dots are drawn for every measured season, which is also
                        what makes a lone season — a one-point segment, and so a
                        zero-length path — visible at all.
                    */}
                    {measured.map((point) => (
                        <circle
                            key={`dot-${String(point.year)}`}
                            cx={bandX(
                                years.indexOf(point.year),
                                years.length,
                                PLOT,
                            )}
                            cy={strengthY(point.strength ?? 0, PLOT)}
                            r="4.5"
                            fill="currentColor"
                        />
                    ))}
                </g>
            </svg>
        </figure>
    );
}
