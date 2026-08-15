import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { formatDiff, formatWld } from '@/components/head-to-head/format';
import { Panel } from '@/components/ui/layout';
import type { HeadToHeadRecord } from '@/server/dto/head-to-head.dto';
import type { Club } from '@/server/dto/shared.dto';

/**
 * W–L–D and goals, always from club A's perspective. The forfeit caveat is
 * printed rather than assumed: the record counts forfeits but the goal figures
 * beside it do not, and that asymmetry is invisible otherwise.
 */
export function RecordSummary({
    a,
    b,
    record,
}: {
    readonly a: Club;
    readonly b: Club;
    readonly record: HeadToHeadRecord;
}): JSX.Element {
    return (
        <Panel
            tone="raised"
            className="mb-6 p-6 sm:p-8"
        >
            <p className="text-lg font-medium text-ink">
                <span className={accentText(a.accent)}>{a.name}</span>
                {' vs '}
                <span className={accentText(b.accent)}>{b.name}</span>
            </p>
            <p className="numeric mt-3 text-3xl font-medium text-ink">
                {formatWld(record)}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
                {`Won–lost–drawn from ${a.name}'s perspective, over ${String(record.played)} completed ${record.played === 1 ? 'game' : 'games'}.`}
            </p>
            <p className="mt-3 text-sm text-ink-body">
                <span className="numeric">
                    {`${String(record.goalsFor)}–${String(record.goalsAgainst)}`}
                </span>
                {' goals ('}
                <span className="numeric">
                    {formatDiff(record.goalsFor - record.goalsAgainst)}
                </span>
                ). Forfeits count as results but contribute no goals.
            </p>
        </Panel>
    );
}
