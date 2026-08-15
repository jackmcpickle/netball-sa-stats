import type { JSX } from 'react';
import { formatDiff, formatWld } from '@/components/head-to-head/format';
import { Panel } from '@/components/ui/layout';
import type { SeasonRecord } from '@/server/dto/head-to-head.dto';

/** One row per season the pair met in. Renders nothing when they never did. */
export function SeasonStrip({
    seasons,
}: {
    readonly seasons: readonly SeasonRecord[];
}): JSX.Element | null {
    if (seasons.length === 0) {
        return null;
    }
    return (
        <Panel className="mb-6 p-6">
            <p className="label-mono text-ink-muted">BY SEASON</p>
            <ul className="mt-3 flex flex-col gap-2">
                {seasons.map((season) => (
                    <li
                        key={season.year}
                        className="flex flex-wrap items-baseline gap-x-4 text-sm text-ink-body"
                    >
                        <span className="numeric w-12 font-semibold text-ink">
                            {season.year}
                        </span>
                        <span className="numeric">{formatWld(season)}</span>
                        <span className="text-ink-muted">
                            {`${String(season.played)} played`}
                        </span>
                        <span className="numeric text-ink-muted">
                            {formatDiff(season.goalDiff)}
                        </span>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}
