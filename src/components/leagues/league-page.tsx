import { Link, getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, NO_VALUE } from '@/components/format';
import { ClubLink } from '@/components/links';
import { ChampionshipTable } from '@/components/rankings/championship-table';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';
import type { TableState } from '@/db/queries/pagination';

const routeApi = getRouteApi('/leagues/$competitionKey');

export function LeaguePage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();
    const { competition, season } = data;

    const seasonOptions = useMemo(
        () =>
            data.coverage.rankedYears.map((year) => ({
                label: String(year),
                value: year,
            })),
        [data.coverage.rankedYears],
    );

    const onSeasonChange = useCallback(
        (nextSeason: number) => {
            void navigate({
                resetScroll: false,
                search: { season: nextSeason },
            });
        },
        [navigate],
    );

    const onTableChange = useCallback(
        (next: TableState) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({
                    ...previous,
                    dir: next.desc ? 'desc' : 'asc',
                    page: next.page,
                    pageSize: next.pageSize,
                    sort: next.sort,
                }),
            });
        },
        [navigate],
    );

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{competition.shortName}</Eyebrow>
            <div className="mt-4">
                <PageTitle>{competition.name}</PageTitle>
            </div>
            <p className="mt-4 max-w-[56ch] text-lg leading-[1.55] text-ink-body">
                {data.hasChampionship
                    ? 'Clubs, ladders and championship score for this league only. Other associations are not mixed in.'
                    : 'Clubs and ladders for this league. It is not part of the AMND / Premier League championship until its grades have weights.'}
            </p>

            {data.hasChampionship && !isNull(season) && !isNull(data.tableState) ? (
                <div className="mt-10">
                    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-2xl font-medium tracking-tight text-ink">
                            {`${String(season.year)} championship`}
                        </h2>
                        {seasonOptions.length > 1 ? (
                            <FieldSelect
                                label="Season"
                                value={season.year}
                                options={seasonOptions}
                                onValueChange={onSeasonChange}
                            />
                        ) : null}
                    </div>
                    <ChampionshipTable
                        rows={season.rows}
                        year={season.year}
                        previousYear={data.previousYear}
                        coverageChanged={season.coverageChanged}
                        totalRows={data.totalRows}
                        state={data.tableState}
                        onChange={onTableChange}
                    />
                </div>
            ) : null}

            <h2 className="mt-12 text-2xl font-medium tracking-tight text-ink">
                Clubs
            </h2>
            {data.clubs.length === 0 ? (
                <Panel className="mt-4 p-6">
                    <p className="text-ink-body">
                        {data.hasPlayHqOrg
                            ? 'No imported seasons yet. Fetch is wired; ladders land after an import.'
                            : 'No PlayHQ organisation is confirmed for this league yet.'}
                    </p>
                </Panel>
            ) : (
                <ul className="mt-4 grid list-none gap-px overflow-hidden rounded-card border border-rule bg-rule p-0 sm:grid-cols-2">
                    {data.clubs.map((entry) => (
                        <li key={entry.club.key}>
                            <ClubLink
                                clubKey={entry.club.key}
                                className="flex h-full items-baseline justify-between gap-4 bg-paper p-5 no-underline hover:bg-paper-sunken"
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        aria-hidden="true"
                                        className={`size-2.5 shrink-0 rounded-full bg-current ${accentText(entry.club.accent)}`}
                                    />
                                    <span className="font-semibold text-ink">
                                        {entry.club.name}
                                    </span>
                                </span>
                                <span className="numeric text-ink-muted">
                                    {isNull(entry.rank)
                                        ? NO_VALUE
                                        : `#${String(entry.rank)} · ${formatNumber(entry.points, 1)}`}
                                </span>
                            </ClubLink>
                        </li>
                    ))}
                </ul>
            )}

            <h2 className="mt-12 text-2xl font-medium tracking-tight text-ink">
                Ladders
            </h2>
            {data.grades.length === 0 ? (
                <Panel className="mt-4 p-6">
                    <p className="text-ink-body">
                        No grades are imported for this league yet.
                    </p>
                </Panel>
            ) : (
                <ul className="mt-4 grid list-none gap-2 p-0">
                    {data.grades.map((grade) => (
                        <li key={grade.key}>
                            <Link
                                to="/ladders"
                                search={{
                                    competition: competition.key,
                                    grade: grade.key,
                                    year: grade.year,
                                }}
                                className="text-ink no-underline hover:underline"
                            >
                                {`${grade.name} · ${String(grade.year)} · ${String(grade.teamCount)} teams`}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </PageShell>
    );
}
