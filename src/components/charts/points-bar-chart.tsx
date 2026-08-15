import { useMemo } from 'react';
import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { ChartFrame } from '@/components/charts/chart-frame';
import type { ChartHit } from '@/components/charts/nearest-hit';
import { barHeight } from '@/components/charts/scale';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';
import type { TimelineSlot } from '@/components/charts/timeline-slots';
import { useChartInteraction } from '@/components/charts/use-chart-interaction';
import type { ClubSeasonPoints } from '@/server/dto/club-profile.dto';
import type { AccentName } from '@/server/dto/shared.dto';

const TRACK = 150;
const BAR_WIDTH = 46;
const GAP = 18;
const BREAK_WIDTH = 36;
const TOP = 22;
const BASELINE = TOP + TRACK;
const YEAR_BASELINE = BASELINE + 20;
const HEIGHT = YEAR_BASELINE + 10;
const HIT_DISTANCE = 40;

interface PointsBarChartProps {
    readonly seasons: readonly ClubSeasonPoints[];
    readonly accent: AccentName;
}

interface GapDraw {
    readonly kind: 'gap';
    readonly key: string;
    readonly x: number;
    readonly label: string;
}

interface BarDraw {
    readonly kind: 'bar';
    readonly key: string;
    readonly season: ClubSeasonPoints;
    readonly x: number;
    readonly height: number;
    readonly hit: ChartHit;
}

type DrawSlot = GapDraw | BarDraw;

interface BarLayout {
    readonly width: number;
    readonly draws: readonly DrawSlot[];
    readonly slots: readonly TimelineSlot[];
    readonly byYear: Map<number, ClubSeasonPoints>;
    readonly hits: readonly ChartHit[];
}

/** The bar and its tooltip hit for one ranked-or-not season slot. */
function barDraw(
    season: ClubSeasonPoints,
    slotX: number,
    max: number,
): BarDraw {
    const height = barHeight(season.points, max, TRACK);
    const isRanked = season.status === 'ranked';
    const hit: ChartHit = {
        detail: isRanked
            ? `${season.points.toFixed(1)} pts · #${String(season.rank ?? 0)}`
            : 'Not ranked yet',
        id: `season-${String(season.year)}`,
        label: String(season.year),
        x: slotX + BAR_WIDTH / 2,
        y: isRanked ? BASELINE - height / 2 : TOP + TRACK / 2,
    };
    return {
        height,
        hit,
        key: String(season.year),
        kind: 'bar',
        season,
        x: slotX,
    };
}

function layoutBars(seasons: readonly ClubSeasonPoints[]): BarLayout {
    const byYear = new Map(seasons.map((season) => [season.year, season]));
    const years = seasons.map((season) => season.year);
    const slots = timelineSlots(years);
    const max = Math.max(1, ...seasons.map((season) => season.points));

    let width = 0;
    for (const slot of slots) {
        width += slot.kind === 'gap' ? BREAK_WIDTH + GAP : BAR_WIDTH + GAP;
    }

    const draws: DrawSlot[] = [];
    const hits: ChartHit[] = [];
    let x = 0;
    for (const slot of slots) {
        if (slot.kind === 'gap') {
            draws.push({
                key: `gap-${String(slot.afterYear)}`,
                kind: 'gap',
                label: gapLabel(slot.missingYears),
                x,
            });
            x += BREAK_WIDTH + GAP;
        } else {
            const season = byYear.get(slot.year);
            const slotX = x;
            x += BAR_WIDTH + GAP;
            if (season) {
                const draw = barDraw(season, slotX, max);
                hits.push(draw.hit);
                draws.push(draw);
            }
        }
    }

    return { byYear, draws, hits, slots, width };
}

/**
 * Championship points by season. Top-three finishes take the club's accent;
 * everything else stays neutral so the good years read at a glance.
 *
 * A season the club is not ranked in draws an outlined slot rather than a
 * zero-height bar, so "no ranking yet" cannot be misread as "scored nothing".
 * Missing dataset years (the archive→PlayHQ hole) render as a labelled break,
 * not as empty club seasons.
 */
export function PointsBarChart({
    seasons,
    accent,
}: PointsBarChartProps): JSX.Element {
    const layout = useMemo(() => layoutBars(seasons), [seasons]);
    const interaction = useChartInteraction({
        hits: layout.hits,
        maxDistance: HIT_DISTANCE,
    });
    const { handlePointerMove, handlePointerLeave, svgRef } = interaction;
    const activeId = interaction.hit?.id ?? null;

    return (
        <ChartFrame
            testId="points-bar-chart"
            frameRef={interaction.frameRef}
            hit={interaction.hit}
            tooltipId={interaction.tooltipId}
            tooltipRef={interaction.tooltipRef}
        >
            <ul className="sr-only">
                {layout.slots.map((slot) =>
                    slot.kind === 'gap' ? (
                        <li key={`gap-${String(slot.afterYear)}`}>
                            {`No season data for ${gapLabel(slot.missingYears)}.`}
                        </li>
                    ) : (
                        <li key={slot.year}>
                            {(() => {
                                const season = layout.byYear.get(slot.year);
                                if (!season) {
                                    return `${String(slot.year)}: unknown.`;
                                }
                                return season.status === 'ranked'
                                    ? `${String(season.year)}: ${season.points.toFixed(1)} championship points, ranked ${String(season.rank ?? 0)}.`
                                    : `${String(season.year)}: not ranked yet.`;
                            })()}
                        </li>
                    ),
                )}
            </ul>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${String(layout.width)} ${String(HEIGHT)}`}
                aria-hidden="true"
                className="block h-[200px] w-full"
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
            >
                {layout.draws.map((draw) => {
                    if (draw.kind === 'gap') {
                        return (
                            <g key={draw.key}>
                                <line
                                    x1={draw.x + BREAK_WIDTH / 2}
                                    x2={draw.x + BREAK_WIDTH / 2}
                                    y1={TOP}
                                    y2={BASELINE}
                                    className="stroke-rule"
                                    strokeWidth="1"
                                    strokeDasharray="4 5"
                                />
                                <text
                                    x={draw.x + BREAK_WIDTH / 2}
                                    y={YEAR_BASELINE}
                                    textAnchor="middle"
                                    className="fill-ink-faint font-mono text-[9px]"
                                >
                                    {draw.label}
                                </text>
                            </g>
                        );
                    }

                    const { season, height, x, hit } = draw;
                    const isRanked = season.status === 'ranked';
                    const isStrong = (season.rank ?? 99) <= 3;
                    return (
                        <g
                            key={draw.key}
                            className={accentText(accent)}
                        >
                            {isRanked ? (
                                <rect
                                    x={x}
                                    y={BASELINE - height}
                                    width={BAR_WIDTH}
                                    height={height}
                                    rx="6"
                                    className={`chart-bar ${
                                        isStrong
                                            ? 'fill-current'
                                            : 'fill-rule-soft'
                                    }`}
                                    data-point-id={hit.id}
                                    data-active={
                                        activeId === hit.id ? 'true' : 'false'
                                    }
                                    data-label={String(season.year)}
                                    data-year={season.year}
                                    data-value={season.points.toFixed(1)}
                                />
                            ) : (
                                <rect
                                    x={x + 0.5}
                                    y={TOP + 0.5}
                                    width={BAR_WIDTH - 1}
                                    height={TRACK - 1}
                                    rx="6"
                                    fill="none"
                                    strokeDasharray="3 4"
                                    className="stroke-rule-soft"
                                    data-point-id={hit.id}
                                    data-label={String(season.year)}
                                    data-year={season.year}
                                    data-value="n/a"
                                />
                            )}
                            <text
                                x={x + BAR_WIDTH / 2}
                                y={isRanked ? BASELINE - height - 8 : TOP + 84}
                                textAnchor="middle"
                                className="chart-bar-label fill-ink-muted text-[11px]"
                            >
                                {isRanked
                                    ? `#${String(season.rank ?? 0)}`
                                    : 'n/a'}
                            </text>
                            <text
                                x={x + BAR_WIDTH / 2}
                                y={YEAR_BASELINE}
                                textAnchor="middle"
                                className="fill-ink-faint font-mono text-[10px]"
                            >
                                {season.year}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </ChartFrame>
    );
}
