import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import { useCallback } from 'react';
import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, NO_VALUE } from '@/components/format';
import { ClubLink, LeagueLink } from '@/components/links';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { SegmentedToggle } from '@/components/ui/toggle';
import type { ClubIndexEntry, ClubIndexGroup } from '@/server/dto/clubs.dto';

const routeApi = getRouteApi('/clubs/');

/** The line under a club's rank: its points, or why it has no rank. */
function clubSummaryLine(entry: ClubIndexEntry, year: number | null): string {
    if (!isNull(entry.rank)) {
        return `${formatNumber(entry.points, 1)} pts · ${String(entry.teams)} teams`;
    }
    if (isNull(entry.lastRankedYear)) {
        return year === null
            ? 'not ranked'
            : `not ranked in ${String(year)}`;
    }
    return `last ranked ${String(entry.lastRankedYear)}`;
}

const TOGGLE_OPTIONS = [
    { label: 'Present clubs', value: false },
    { label: 'All clubs (incl. past)', value: true },
] as const;

function ClubCards({
    entries,
    year,
}: {
    readonly entries: readonly ClubIndexEntry[];
    readonly year: number | null;
}): JSX.Element {
    return (
        <ul className="mt-4 grid list-none gap-px overflow-hidden rounded-card border border-rule bg-rule p-0 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
                <li key={entry.club.key}>
                    <ClubLink
                        clubKey={entry.club.key}
                        className="flex h-full flex-col justify-between gap-6 bg-paper p-6 no-underline transition-colors hover:bg-paper-sunken"
                    >
                        <span className="flex items-start gap-3">
                            <span
                                aria-hidden="true"
                                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                                    isNull(entry.rank)
                                        ? 'border border-current bg-transparent'
                                        : 'bg-current'
                                } ${accentText(entry.club.accent)}`}
                            />
                            <span
                                className={`text-base font-semibold ${
                                    isNull(entry.rank)
                                        ? 'text-ink-muted'
                                        : 'text-ink'
                                }`}
                            >
                                {entry.club.name}
                            </span>
                        </span>
                        <span className="flex items-baseline gap-4">
                            <span className="numeric text-2xl font-medium text-ink">
                                {isNull(entry.rank)
                                    ? NO_VALUE
                                    : `#${String(entry.rank)}`}
                            </span>
                            <span className="text-[13px] text-ink-muted">
                                {clubSummaryLine(entry, year)}
                            </span>
                        </span>
                    </ClubLink>
                </li>
            ))}
        </ul>
    );
}

function LeagueGroup({ group }: { readonly group: ClubIndexGroup }): JSX.Element {
    return (
        <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xl font-medium tracking-tight text-ink">
                    {group.competition.name}
                </h2>
                <LeagueLink
                    competitionKey={group.competition.key}
                    className="text-sm text-ink-muted no-underline hover:underline"
                >
                    League page
                </LeagueLink>
            </div>
            {group.entries.length === 0 ? (
                <p className="mt-4 text-ink-body">
                    No clubs imported for this league yet.
                </p>
            ) : (
                <ClubCards
                    entries={group.entries}
                    year={group.year}
                />
            )}
        </section>
    );
}

export function ClubIndexPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onTogglePast = useCallback(
        (includePast: boolean) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({ ...previous, includePast }),
            });
        },
        [navigate],
    );

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>CLUB PROFILES</Eyebrow>
            <div className="mt-4">
                <PageTitle>Clubs by league</PageTitle>
            </div>
            <p className="mt-4 max-w-[56ch] text-lg leading-[1.55] text-ink-body">
                AMND, Premier League and Reserves each have their own list.
                A club that plays in more than one league appears in each. Open
                a club for its full record, or a league page for that
                association alone.
            </p>

            <div className="mt-6">
                <SegmentedToggle
                    label="Clubs shown"
                    value={data.includePast}
                    hint={`Showing ${String(data.entries.length)} of ${String(data.totalCount)} clubs`}
                    options={TOGGLE_OPTIONS}
                    onValueChange={onTogglePast}
                />
            </div>

            {data.groups.map((group) => (
                <LeagueGroup
                    key={group.competition.key}
                    group={group}
                />
            ))}
        </PageShell>
    );
}
