import type { JSX } from 'react';
import { HeadToHeadLink } from '@/components/head-to-head-link';
import { Panel } from '@/components/ui/layout';
import type { TopOpponent } from '@/server/dto/club-profile.dto';

/**
 * The clubs this one has met most often, each linking to the full record.
 * Renders nothing at all when the list is empty: a club with no fixture data
 * should not get an empty box implying the answer is zero.
 */
export function TopOpponentsPanel({
    clubKey,
    clubName,
    opponents,
}: {
    readonly clubKey: string;
    readonly clubName: string;
    readonly opponents: readonly TopOpponent[];
}): JSX.Element | null {
    if (opponents.length === 0) {
        return null;
    }
    return (
        <Panel className="mb-6 p-5 sm:p-8">
            <h2 className="text-lg font-semibold text-ink">
                {'Most-played opponents'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
                {`From fixture-level results, which cover 2025 onwards. Earlier seasons are held as ladders, so they contribute no meetings here.`}
            </p>
            <ul className="mt-4 flex flex-col gap-2">
                {opponents.map((opponent) => (
                    <li
                        key={opponent.club.key}
                        className="flex items-baseline justify-between gap-4 text-sm"
                    >
                        <HeadToHeadLink
                            a={clubKey}
                            b={opponent.club.key}
                            className="font-semibold text-ink no-underline hover:underline"
                        >
                            {opponent.club.name}
                        </HeadToHeadLink>
                        <span className="numeric text-ink-muted">
                            {`${String(opponent.played)} vs ${clubName}`}
                        </span>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}
