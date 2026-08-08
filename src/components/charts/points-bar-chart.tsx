import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { barHeight } from '@/components/charts/scale';
import { gapLabel, timelineSlots } from '@/components/charts/timeline-slots';
import type { AccentName, ClubSeasonPoints } from '@/data/types';

const TRACK = 150;
const BAR_WIDTH = 46;
const GAP = 18;
const BREAK_WIDTH = 36;
const TOP = 22;
const BASELINE = TOP + TRACK;
const YEAR_BASELINE = BASELINE + 20;
const HEIGHT = YEAR_BASELINE + 10;

interface PointsBarChartProps {
    readonly seasons: readonly ClubSeasonPoints[];
    readonly accent: AccentName;
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
    const byYear = new Map(seasons.map((season) => [season.year, season]));
    const years = seasons.map((season) => season.year);
    const slots = timelineSlots(years);
    const max = Math.max(1, ...seasons.map((season) => season.points));

    let width = 0;
    for (const slot of slots) {
        width += slot.kind === 'gap' ? BREAK_WIDTH + GAP : BAR_WIDTH + GAP;
    }

    return (
        <>
            <ul className="sr-only">
                {slots.map((slot) =>
                    slot.kind === 'gap' ? (
                        <li key={`gap-${String(slot.afterYear)}`}>
                            {`No season data for ${gapLabel(slot.missingYears)}.`}
                        </li>
                    ) : (
                        <li key={slot.year}>
                            {(() => {
                                const season = byYear.get(slot.year);
                                if (!season)
                                    return `${String(slot.year)}: unknown.`;
                                return season.status === 'ranked'
                                    ? `${String(season.year)}: ${season.points.toFixed(1)} championship points, ranked ${String(season.rank ?? 0)}.`
                                    : `${String(season.year)}: not ranked yet.`;
                            })()}
                        </li>
                    ),
                )}
            </ul>
            <svg
                viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
                aria-hidden="true"
                className="block h-[200px] w-full"
            >
                {(() => {
                    let x = 0;
                    return slots.map((slot) => {
                        if (slot.kind === 'gap') {
                            const slotX = x;
                            x += BREAK_WIDTH + GAP;
                            return (
                                <g key={`gap-${String(slot.afterYear)}`}>
                                    <line
                                        x1={slotX + BREAK_WIDTH / 2}
                                        x2={slotX + BREAK_WIDTH / 2}
                                        y1={TOP}
                                        y2={BASELINE}
                                        className="stroke-rule"
                                        strokeWidth="1"
                                        strokeDasharray="4 5"
                                    />
                                    <text
                                        x={slotX + BREAK_WIDTH / 2}
                                        y={YEAR_BASELINE}
                                        textAnchor="middle"
                                        className="fill-ink-faint font-mono text-[9px]"
                                    >
                                        {gapLabel(slot.missingYears)}
                                    </text>
                                </g>
                            );
                        }

                        const season = byYear.get(slot.year);
                        const slotX = x;
                        x += BAR_WIDTH + GAP;
                        if (!season) return null;
                        const height = barHeight(season.points, max, TRACK);
                        const isRanked = season.status === 'ranked';
                        const isStrong = (season.rank ?? 99) <= 3;
                        return (
                            <g
                                key={season.year}
                                className={accentText(accent)}
                            >
                                {isRanked ? (
                                    <rect
                                        x={slotX}
                                        y={BASELINE - height}
                                        width={BAR_WIDTH}
                                        height={height}
                                        rx="6"
                                        className={
                                            isStrong
                                                ? 'fill-current'
                                                : 'fill-rule-soft'
                                        }
                                    />
                                ) : (
                                    <rect
                                        x={slotX + 0.5}
                                        y={TOP + 0.5}
                                        width={BAR_WIDTH - 1}
                                        height={TRACK - 1}
                                        rx="6"
                                        fill="none"
                                        strokeDasharray="3 4"
                                        className="stroke-rule-soft"
                                    />
                                )}
                                <text
                                    x={slotX + BAR_WIDTH / 2}
                                    y={
                                        isRanked
                                            ? BASELINE - height - 8
                                            : TOP + 84
                                    }
                                    textAnchor="middle"
                                    className="fill-ink-muted text-[11px]"
                                >
                                    {isRanked
                                        ? `#${String(season.rank ?? 0)}`
                                        : 'n/a'}
                                </text>
                                <text
                                    x={slotX + BAR_WIDTH / 2}
                                    y={YEAR_BASELINE}
                                    textAnchor="middle"
                                    className="fill-ink-faint font-mono text-[10px]"
                                >
                                    {season.year}
                                </text>
                            </g>
                        );
                    });
                })()}
            </svg>
        </>
    );
}
