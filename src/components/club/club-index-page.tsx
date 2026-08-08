import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, NO_VALUE } from '@/components/format';
import { ClubLink } from '@/components/links';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';

const routeApi = getRouteApi('/clubs/');

export function ClubIndexPage(): JSX.Element {
    const { entries, year } = routeApi.useLoaderData();

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'CLUB PROFILES'}</Eyebrow>
            <div className="mt-4">
                <PageTitle>{'Every club in the dataset'}</PageTitle>
            </div>
            <p className="mt-4 max-w-[56ch] text-lg leading-[1.55] text-ink-body">
                {`Ranks shown are from the ${String(year)} championship, the most recent completed season. Open a club for its full record across every grade.`}
            </p>

            <ul className="mt-10 grid list-none gap-px overflow-hidden rounded-card border border-rule bg-rule p-0 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                    <li key={entry.club.key}>
                        <ClubLink
                            clubKey={entry.club.key}
                            className="flex h-full flex-col justify-between gap-6 bg-paper p-6 no-underline transition-colors hover:bg-paper-sunken"
                        >
                            <span className="flex items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className={`mt-1.5 size-2.5 shrink-0 rounded-full bg-current ${accentText(entry.club.accent)}`}
                                />
                                <span className="text-base font-semibold text-ink">
                                    {entry.club.name}
                                </span>
                            </span>
                            <span className="flex items-baseline gap-4">
                                <span className="numeric text-2xl font-medium text-ink">
                                    {entry.rank === null
                                        ? NO_VALUE
                                        : `#${String(entry.rank)}`}
                                </span>
                                <span className="text-[13px] text-ink-muted">
                                    {entry.rank === null
                                        ? `not ranked in ${String(year)}`
                                        : `${formatNumber(entry.points, 1)} pts · ${String(entry.teams)} teams`}
                                </span>
                            </span>
                        </ClubLink>
                    </li>
                ))}
            </ul>
        </PageShell>
    );
}
