import { useMemo } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { accentText } from '@/components/accent';
import { ChartFrame } from '@/components/charts/chart-frame';
import type { ChartHit } from '@/components/charts/nearest-hit';
import { bandX, linePath, rankTicks, rankY } from '@/components/charts/scale';
import type { LinePoint, Plot } from '@/components/charts/scale';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';
import { useChartInteraction } from '@/components/charts/use-chart-interaction';
import { ClubLink } from '@/components/links';
import type { ClubRankSeries } from '@/server/dto/rankings.dto';

const PLOT: Plot = { x0: 44, x1: 1060, y0: 16, y1: 300 };
const VIEW_BOX = '0 0 1240 344';
const LABEL_BASELINE = 326;
/** ViewBox units — roughly one season's spacing on the rankings chart. */
const HIT_DISTANCE = 36;

// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: axis tick figures sit beside the plot, not in body copy
// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: the x-axis year ticks must fit one per plotted band
const YEAR_LABEL_CLASS = 'fill-ink-muted font-mono text-[11px]';
const AXIS_LABEL_CLASS = 'fill-ink-faint font-mono text-[11px]';
// oxlint-disable-next-line react-doctor/no-tiny-text -- deliberate dense chart annotation: the gap marker label must fit between two plotted years
const GAP_LABEL_CLASS = 'fill-ink-faint font-mono text-[9px]';

interface RankMovementChartProps {
    readonly series: readonly ClubRankSeries[];
    readonly years: readonly number[];
    readonly worstRank: number;
    /** Drawn heavier, with the rest dimmed. */
    readonly focusKey?: string;
}

function buildHits(
    series: readonly ClubRankSeries[],
    years: readonly number[],
    axisMax: number,
): ChartHit[] {
    const hits: ChartHit[] = [];
    for (const entry of series) {
        for (const point of entry.points) {
            const index = years.indexOf(point.year);
            if (index === -1) {
                continue;
            }
            hits.push({
                id: `${entry.club.key}-${String(point.year)}`,
                label: entry.club.name,
                detail: `${String(point.year)} · #${String(point.rank)}`,
                x: bandX(index, years.length, PLOT),
                y: rankY(point.rank, axisMax, PLOT),
            });
        }
    }
    return hits;
}

function seriesPolyline(
    entry: ClubRankSeries,
    years: readonly number[],
    axisMax: number,
): (LinePoint | null)[] {
    const byYear = new Map(entry.points.map((point) => [point.year, point]));
    const points: (LinePoint | null)[] = [];
    for (const [index, year] of years.entries()) {
        if (index > 0 && year - (years[index - 1] ?? year) > 1) {
            // Break the polyline across dataset holes so the archive→PlayHQ
            // gap never reads as continuous form.
            points.push(null);
        }
        const point = byYear.get(year);
        points.push(
            point
                ? {
                      x: bandX(index, years.length, PLOT),
                      y: rankY(point.rank, axisMax, PLOT),
                  }
                : null,
        );
    }
    return points;
}

/** Dot radius: focused series draw larger, and the hovered point larger again. */
function dotRadius(active: boolean, isFocus: boolean): number {
    if (active) {
        return isFocus ? 7 : 5.5;
    }
    return isFocus ? 5 : 3.5;
}

function rankGrid(ticks: readonly number[], axisMax: number): JSX.Element[] {
    return ticks.map((rank) => {
        const y = rankY(rank, axisMax, PLOT);
        return (
            <g key={rank}>
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
                    {`#${String(rank)}`}
                </text>
            </g>
        );
    });
}

function yearLabels(years: readonly number[]): JSX.Element[] {
    return years.map((year, index) => (
        <text
            key={year}
            x={bandX(index, years.length, PLOT)}
            y={LABEL_BASELINE}
            textAnchor="middle"
            className={YEAR_LABEL_CLASS}
        >
            {year}
        </text>
    ));
}

function gapMarkers(years: readonly number[]): JSX.Element[] {
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
                    y2={PLOT.y1}
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

function seriesMarks(
    series: readonly ClubRankSeries[],
    years: readonly number[],
    axisMax: number,
    focusKey: string | undefined,
    activeId: string | null,
): JSX.Element[] {
    return series.map((entry) => {
        const points = seriesPolyline(entry, years, axisMax);
        const last = points.findLast((point) => point !== null);
        const isFocus = entry.club.key === focusKey;
        return (
            <g
                key={entry.club.key}
                className={accentText(entry.club.accent)}
                opacity={focusKey && !isFocus ? 0.5 : 1}
            >
                <path
                    d={linePath(points)}
                    pathLength={1}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isFocus ? 3.5 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="chart-line"
                />
                {years.map((year, index) => {
                    const point = entry.points.find(
                        (candidate) => candidate.year === year,
                    );
                    if (!point) {
                        return null;
                    }
                    const id = `${entry.club.key}-${String(year)}`;
                    const active = activeId === id;
                    return (
                        <circle
                            key={year}
                            cx={bandX(index, years.length, PLOT)}
                            cy={rankY(point.rank, axisMax, PLOT)}
                            r={dotRadius(active, isFocus)}
                            fill="currentColor"
                            className="chart-dot"
                            data-active={active ? 'true' : 'false'}
                            data-point-id={id}
                            data-label={entry.club.name}
                            data-year={year}
                            data-value={`#${String(point.rank)}`}
                        />
                    );
                })}
                <text
                    x={PLOT.x1 + 12}
                    y={(last?.y ?? PLOT.y0) + 4}
                    fill="currentColor"
                    className="text-xs font-medium"
                >
                    {entry.club.name}
                </text>
            </g>
        );
    });
}

interface RankSvgProps {
    readonly series: readonly ClubRankSeries[];
    readonly years: readonly number[];
    readonly ticks: readonly number[];
    readonly axisMax: number;
    readonly focusKey?: string;
    readonly activeId: string | null;
    readonly svgRef: (node: SVGSVGElement | null) => void;
    readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    readonly onPointerLeave: () => void;
}

function renderRankSvg({
    series,
    years,
    ticks,
    axisMax,
    focusKey,
    activeId,
    svgRef,
    onPointerMove,
    onPointerLeave,
}: RankSvgProps): JSX.Element {
    return (
        <svg
            ref={svgRef}
            viewBox={VIEW_BOX}
            aria-hidden="true"
            className="block h-[340px] w-full overflow-visible"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            {rankGrid(ticks, axisMax)}
            {yearLabels(years)}
            {gapMarkers(years)}
            {seriesMarks(series, years, axisMax, focusKey, activeId)}
        </svg>
    );
}

/**
 * Rank movement across the ranked seasons. The y axis is inverted — #1 sits at
 * the top — because in a ladder a lower number is a better result.
 *
 * Hand-rolled rather than charted by a library: the data is a few dozen points,
 * and the SVG stays light enough to hydrate for pointer tooltips.
 */
export function RankMovementChart({
    series,
    years,
    worstRank,
    focusKey,
}: RankMovementChartProps): JSX.Element {
    // The plotted clubs are the strongest in the championship, so they occupy
    // the top of a 25-deep field. Scaling to the field would squash every line
    // into the first fifth of the chart, so the axis follows the plotted range
    // (plus a row of headroom) and is labelled with real ranks throughout.
    const deepestPlotted = Math.max(
        2,
        ...series.flatMap((entry) => entry.points.map((point) => point.rank)),
    );
    const axisMax = Math.min(worstRank, deepestPlotted + 1);
    const ticks = rankTicks(axisMax, Math.max(1, Math.ceil(axisMax / 6)));
    const hits = useMemo(
        () => buildHits(series, years, axisMax),
        [series, years, axisMax],
    );
    const interaction = useChartInteraction({
        hits,
        maxDistance: HIT_DISTANCE,
    });

    return (
        <figure className="m-0">
            {/*
                The chart is hidden from assistive tech: every value it plots is
                also in the championship table below, and a described polyline
                is worse to listen to than the table it duplicates. The summary
                that follows says what the picture shows.
            */}
            <p className="sr-only">
                {`Line chart of club championship position for ${String(series.length)} clubs across ${String(years.length)} seasons, ${String(years[0])} to ${String(years.at(-1))}. Rank 1 is plotted at the top. Lines break across years with no data. The same figures are listed in the championship table below.`}
            </p>
            <ChartFrame
                testId="rank-movement-chart"
                frameRef={interaction.frameRef}
                hit={interaction.hit}
                tooltipId={interaction.tooltipId}
                tooltipRef={interaction.tooltipRef}
            >
                {renderRankSvg({
                    series,
                    years,
                    ticks,
                    axisMax,
                    focusKey,
                    activeId: interaction.hit?.id ?? null,
                    svgRef: interaction.svgRef,
                    onPointerMove: interaction.handlePointerMove,
                    onPointerLeave: interaction.handlePointerLeave,
                })}
            </ChartFrame>

            <figcaption className="mt-6 flex flex-wrap gap-2">
                {series.map((entry) => (
                    <ClubLink
                        key={entry.club.key}
                        clubKey={entry.club.key}
                        className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[13px] font-medium text-ink no-underline ring-1 ring-rule hover:bg-paper-sunken"
                    >
                        <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${accentText(entry.club.accent)} bg-current`}
                        />
                        {entry.club.name}
                    </ClubLink>
                ))}
            </figcaption>
        </figure>
    );
}
