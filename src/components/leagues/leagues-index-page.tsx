import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import type { JSX } from 'react';
import { LeagueLink } from '@/components/links';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import type { LeagueIndexEntry } from '@/server/dto/leagues.dto';

const routeApi = getRouteApi('/leagues/');

function leagueStatus(entry: LeagueIndexEntry): string {
    if (entry.hasChampionship) {
        return 'Championship scored';
    }
    if (entry.hasPlayHqOrg) {
        return 'Catalogued — not in the AMND/PL score';
    }
    return 'Name seeded — no PlayHQ org yet';
}

function seasonCaption(entry: LeagueIndexEntry): string {
    if (entry.seasonCount === 0) {
        return 'No imported seasons yet';
    }
    const noun = entry.seasonCount === 1 ? 'season' : 'seasons';
    const latest = isNull(entry.latestYear)
        ? ''
        : ` · latest ${String(entry.latestYear)}`;
    return `${String(entry.seasonCount)} ${noun}${latest}`;
}

export function LeaguesIndexPage(): JSX.Element {
    const data = routeApi.useLoaderData();

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>LEAGUES</Eyebrow>
            <div className="mt-4">
                <PageTitle>South Australian associations</PageTitle>
            </div>
            <p className="mt-4 max-w-[56ch] text-lg leading-[1.55] text-ink-body">
                Each league keeps its own clubs, ladders and — where weights
                exist — championship table. The combined AMND / Premier League
                score stays on the home page.
            </p>

            <ul className="mt-10 grid list-none gap-px overflow-hidden rounded-card border border-rule bg-rule p-0 sm:grid-cols-2">
                {data.leagues.map((entry) => (
                    <li key={entry.competition.key}>
                        <LeagueLink
                            competitionKey={entry.competition.key}
                            className="flex h-full flex-col justify-between gap-6 bg-paper p-6 no-underline transition-colors hover:bg-paper-sunken"
                        >
                            <span>
                                <span className="text-base font-semibold text-ink">
                                    {entry.competition.name}
                                </span>
                                <span className="mt-2 block text-[13px] text-ink-muted">
                                    {leagueStatus(entry)}
                                </span>
                            </span>
                            <span className="text-[13px] text-ink-muted">
                                {seasonCaption(entry)}
                            </span>
                        </LeagueLink>
                    </li>
                ))}
            </ul>
            <Panel className="mt-10 p-6">
                <p className="text-sm leading-relaxed text-ink-body">
                    Country associations (Hills, Mid Hills, Southern Hills and
                    the rest) can be added later. They are not wired here.
                </p>
            </Panel>
        </PageShell>
    );
}
