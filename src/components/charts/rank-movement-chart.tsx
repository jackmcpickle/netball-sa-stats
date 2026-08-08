import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import {
    bandX,
    linePath,
    rankTicks,
    rankY,
    type LinePoint,
    type Plot,
} from '@/components/charts/scale';
import { ClubLink } from '@/components/links';
import type { ClubRankSeries } from '@/data/types';

const PLOT: Plot = { x0: 44, x1: 1060, y0: 16, y1: 300 };
const VIEW_BOX = '0 0 1240 344';
const LABEL_BASELINE = 326;

interface RankMovementChartProps {
    readonly series: readonly ClubRankSeries[];
    readonly years: readonly number[];
    readonly worstRank: number;
    /** Drawn heavier, with the rest dimmed. */
    readonly focusKey?: string;
}

/**
 * Rank movement across the ranked seasons. The y axis is inverted — #1 sits at
 * the top — because in a ladder a lower number is a better result.
 *
 * Hand-rolled rather than charted by a library: the data is a few dozen points,
 * it never changes after render, and this way it costs nothing to hydrate.
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

    return (
        <figure className="m-0">
            {/*
                The chart is hidden from assistive tech: every value it plots is
                also in the championship table below, and a described polyline
                is worse to listen to than the table it duplicates. The summary
                that follows says what the picture shows.
            */}
            <p className="sr-only">
                {`Line chart of club championship position for ${String(series.length)} clubs across ${String(years.length)} seasons, ${String(years[0])} to ${String(years.at(-1))}. Rank 1 is plotted at the top. The same figures are listed in the championship table below.`}
            </p>
            <svg
                viewBox={VIEW_BOX}
                aria-hidden="true"
                className="block h-[340px] w-full overflow-visible"
            >
                {ticks.map((rank) => {
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
                                className="fill-ink-faint font-mono text-[11px]"
                            >
                                {`#${String(rank)}`}
                            </text>
                        </g>
                    );
                })}

                {years.map((year, index) => (
                    <text
                        key={year}
                        x={bandX(index, years.length, PLOT)}
                        y={LABEL_BASELINE}
                        textAnchor="middle"
                        className="fill-ink-muted font-mono text-[11px]"
                    >
                        {year}
                    </text>
                ))}

                {series.map((entry) => {
                    const points: (LinePoint | null)[] = years.map((year) => {
                        const point = entry.points.find(
                            (candidate) => candidate.year === year,
                        );
                        return point
                            ? {
                                  x: bandX(
                                      years.indexOf(year),
                                      years.length,
                                      PLOT,
                                  ),
                                  y: rankY(point.rank, axisMax, PLOT),
                              }
                            : null;
                    });
                    const last = points
                        .filter((point) => point !== null)
                        .at(-1);
                    const isFocus = entry.club.key === focusKey;
                    return (
                        <g
                            key={entry.club.key}
                            className={accentText(entry.club.accent)}
                            opacity={focusKey && !isFocus ? 0.5 : 1}
                        >
                            <path
                                d={linePath(points)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={isFocus ? 3.5 : 2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            {points.map((point, pointIndex) =>
                                point ? (
                                    <circle
                                        key={years[pointIndex]}
                                        cx={point.x}
                                        cy={point.y}
                                        r={isFocus ? 5 : 3.5}
                                        fill="currentColor"
                                    />
                                ) : null,
                            )}
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
                })}
            </svg>

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
