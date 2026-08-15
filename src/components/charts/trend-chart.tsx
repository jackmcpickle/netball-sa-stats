import { isNull } from 'es-toolkit';
import { useMemo } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { accentText } from '@/components/accent';
import { ChartFrame } from '@/components/charts/chart-frame';
import type { ChartHit } from '@/components/charts/nearest-hit';
import { bandX, barHeight, linePath, round } from '@/components/charts/scale';
import type { LinePoint, Plot } from '@/components/charts/scale';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';
import {
    describeTrendSlot,
    formatStrength,
    strengthPath,
} from '@/components/charts/trend-path';
import { useChartInteraction } from '@/components/charts/use-chart-interaction';
import type { ClubTrendPoint } from '@/server/dto/club-profile.dto';
import type { AccentName } from '@/server/dto/shared.dto';

const PLOT: Plot = { x0: 44, x1: 1180, y0: 16, y1: 236 };
const TEAMS_BASELINE = 300;
const TEAMS_TRACK = 48;
const LABEL_BASELINE = 322;
const VIEW_BOX = '0 0 1200 336';
const TICKS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
const HIT_DISTANCE = 36;

// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: axis tick figures sit beside the plot, not in body copy
// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: the x-axis year ticks must fit one per plotted band
const YEAR_LABEL_CLASS = 'fill-ink-muted font-mono text-[11px]';
const AXIS_LABEL_CLASS = 'fill-ink-faint font-mono text-[11px]';
// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: the gap marker label must fit between two plotted years
const GAP_LABEL_CLASS = 'fill-ink-faint font-mono text-[9px]';

/** Strength runs bottom (0.00) to top (1.00) on a fixed axis — see below. */
function strengthY(strength: number, plot: Plot): number {
    const clamped = Math.min(Math.max(strength, 0), 1);
    return round(plot.y1 - clamped * (plot.y1 - plot.y0), 2);
}

interface TrendChartProps {
    readonly points: readonly ClubTrendPoint[];
    /** Names the series for assistive tech, e.g. "Matrics, all grades". */
    readonly title: string;
    readonly accent: AccentName;
}

function buildHits(
    points: readonly ClubTrendPoint[],
    years: readonly number[],
    title: string,
): ChartHit[] {
    const hits: ChartHit[] = [];
    for (const point of points) {
        const index = years.indexOf(point.year);
        if (isNull(point.strength) || index === -1) {
            continue;
        }
        hits.push({
            id: `trend-${String(point.year)}`,
            label: title,
            detail: `${String(point.year)} · ${formatStrength(point.strength)} · ${String(point.teams)} ${point.teams === 1 ? 'team' : 'teams'}`,
            x: bandX(index, years.length, PLOT),
            y: strengthY(point.strength, PLOT),
        });
    }
    return hits;
}

function strengthGrid(): JSX.Element[] {
    return TICKS.map((tick) => {
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
                    className={AXIS_LABEL_CLASS}
                >
                    {tick.toFixed(2)}
                </text>
            </g>
        );
    });
}

function trendGaps(years: readonly number[]): JSX.Element[] {
    return timelineSlots(years).flatMap((slot, slotIndex, slots) => {
        if (slot.kind !== 'gap') {
            return [];
        }
        const prev = slots[slotIndex - 1];
        const next = slots[slotIndex + 1];
        if (prev?.kind !== 'year' || next?.kind !== 'year') {
            return [];
        }
        const x =
            (bandX(years.indexOf(prev.year), years.length, PLOT) +
                bandX(years.indexOf(next.year), years.length, PLOT)) /
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
                    className={GAP_LABEL_CLASS}
                >
                    {gapLabel(slot.missingYears)}
                </text>
            </g>,
        ];
    });
}

function teamBars(
    points: readonly ClubTrendPoint[],
    years: readonly number[],
    maxTeams: number,
): JSX.Element[] {
    return points.map((point, index) => {
        const height = barHeight(point.teams, maxTeams, TEAMS_TRACK);
        const x = bandX(index, years.length, PLOT);
        return (
            <rect
                key={`teams-${String(point.year)}`}
                x={x - 7}
                y={TEAMS_BASELINE - height}
                width="14"
                height={height}
                rx="2"
                className="chart-bar fill-rule-soft"
            />
        );
    });
}

function trendYearLabels(
    points: readonly ClubTrendPoint[],
    years: readonly number[],
): (JSX.Element | null)[] {
    return points.map((point, index) =>
        // Every other year is labelled at this width; the rest would collide.
        index % 2 === 0 || index === points.length - 1 ? (
            <text
                key={`label-${String(point.year)}`}
                x={bandX(index, years.length, PLOT)}
                y={LABEL_BASELINE}
                textAnchor="middle"
                className={YEAR_LABEL_CLASS}
            >
                {point.year}
            </text>
        ) : null,
    );
}

function strengthSeries(
    segments: readonly (readonly ClubTrendPoint[])[],
    measured: readonly ClubTrendPoint[],
    years: readonly number[],
    title: string,
    accent: AccentName,
    activeId: string | null,
): JSX.Element {
    return (
        <g className={accentText(accent)}>
            {segments.map((segment) => {
                const [first] = segment;
                if (!first) {
                    return null;
                }
                const linePoints: LinePoint[] = segment.map(
                    (point): LinePoint => ({
                        x: bandX(years.indexOf(point.year), years.length, PLOT),
                        y: strengthY(point.strength ?? 0, PLOT),
                    }),
                );
                return (
                    <path
                        key={`segment-${String(first.year)}`}
                        d={linePath(linePoints)}
                        pathLength={1}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="chart-line"
                    />
                );
            })}
            {/*
                Dots are drawn for every measured season, which is also what
                makes a lone season — a one-point segment, and so a zero-length
                path — visible at all.
            */}
            {measured.map((point) => {
                const id = `trend-${String(point.year)}`;
                return (
                    <circle
                        key={`dot-${String(point.year)}`}
                        cx={bandX(
                            years.indexOf(point.year),
                            years.length,
                            PLOT,
                        )}
                        cy={strengthY(point.strength ?? 0, PLOT)}
                        r={activeId === id ? 6 : 4.5}
                        fill="currentColor"
                        className="chart-dot"
                        data-active={activeId === id ? 'true' : 'false'}
                        data-point-id={id}
                        data-label={title}
                        data-year={point.year}
                        data-value={formatStrength(point.strength)}
                    />
                );
            })}
        </g>
    );
}

interface TrendSvgProps {
    readonly points: readonly ClubTrendPoint[];
    readonly years: readonly number[];
    readonly title: string;
    readonly accent: AccentName;
    readonly maxTeams: number;
    readonly segments: readonly (readonly ClubTrendPoint[])[];
    readonly measured: readonly ClubTrendPoint[];
    readonly activeId: string | null;
    readonly svgRef: (node: SVGSVGElement | null) => void;
    readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    readonly onPointerLeave: () => void;
}

function renderTrendSvg({
    points,
    years,
    title,
    accent,
    maxTeams,
    segments,
    measured,
    activeId,
    svgRef,
    onPointerMove,
    onPointerLeave,
}: TrendSvgProps): JSX.Element {
    return (
        <svg
            ref={svgRef}
            viewBox={VIEW_BOX}
            aria-hidden="true"
            className="block h-[330px] w-full"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            {strengthGrid()}
            {trendGaps(years)}
            {teamBars(points, years, maxTeams)}
            {trendYearLabels(points, years)}
            {strengthSeries(segments, measured, years, title, accent, activeId)}
        </svg>
    );
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
 * points that stay light enough to hydrate for pointer tooltips.
 */
export function TrendChart({
    points,
    title,
    accent,
}: TrendChartProps): JSX.Element {
    const years = useMemo(() => points.map((point) => point.year), [points]);
    const maxTeams = Math.max(1, ...points.map((point) => point.teams));
    const segments = strengthPath(points);
    const measured = points.filter((point) => !isNull(point.strength));
    const hits = useMemo(
        () => buildHits(points, years, title),
        [points, years, title],
    );
    const interaction = useChartInteraction({
        hits,
        maxDistance: HIT_DISTANCE,
    });

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
                            {describeTrendSlot(
                                points.find(
                                    (candidate) => candidate.year === slot.year,
                                ),
                                slot.year,
                            )}
                        </li>
                    ),
                )}
            </ul>

            <ChartFrame
                testId="trend-chart"
                frameRef={interaction.frameRef}
                hit={interaction.hit}
                tooltipId={interaction.tooltipId}
                tooltipRef={interaction.tooltipRef}
            >
                {renderTrendSvg({
                    points,
                    years,
                    title,
                    accent,
                    maxTeams,
                    segments,
                    measured,
                    activeId: interaction.hit?.id ?? null,
                    svgRef: interaction.svgRef,
                    onPointerMove: interaction.handlePointerMove,
                    onPointerLeave: interaction.handlePointerLeave,
                })}
            </ChartFrame>
        </figure>
    );
}
