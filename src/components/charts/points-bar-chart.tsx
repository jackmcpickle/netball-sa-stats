import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { barHeight } from '@/components/charts/scale';
import type { AccentName, ClubSeasonPoints } from '@/data/types';

const TRACK = 150;
const BAR_WIDTH = 46;
const GAP = 18;
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
 */
export function PointsBarChart({
    seasons,
    accent,
}: PointsBarChartProps): JSX.Element {
    const max = Math.max(1, ...seasons.map((season) => season.points));
    const width = seasons.length * (BAR_WIDTH + GAP);

    return (
        <>
            {/* Read out as a list rather than described as a picture. */}
            <ul className="sr-only">
                {seasons.map((season) => (
                    <li key={season.year}>
                        {season.status === 'ranked'
                            ? `${String(season.year)}: ${season.points.toFixed(1)} championship points, ranked ${String(season.rank ?? 0)}.`
                            : `${String(season.year)}: not ranked yet.`}
                    </li>
                ))}
            </ul>
            <svg
                viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
                aria-hidden="true"
                className="block h-[200px] w-full"
            >
                {seasons.map((season, index) => {
                    const x = index * (BAR_WIDTH + GAP);
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
                                    x={x}
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
                                    x={x + 0.5}
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
                                x={x + BAR_WIDTH / 2}
                                y={isRanked ? BASELINE - height - 8 : TOP + 84}
                                textAnchor="middle"
                                className="fill-ink-muted text-[11px]"
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
        </>
    );
}
