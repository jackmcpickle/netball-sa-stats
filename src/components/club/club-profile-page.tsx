import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { accentBg, isDarkAccent } from '@/components/accent';
import { PointsBarChart } from '@/components/charts/points-bar-chart';
import { TrendChart } from '@/components/charts/trend-chart';
import { BandTrendGrid } from '@/components/club/band-trend-grid';
import { ClubResultsTable } from '@/components/club/club-results-table';
import { ClubStatGrid } from '@/components/club/club-stat-grid';
import { TopOpponentsPanel } from '@/components/club/top-opponents-panel';
import { PageShell, Panel } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';
import type { TableState } from '@/db/queries/pagination';
import type { TableSearch } from '@/routes/-table-params';

const routeApi = getRouteApi('/clubs/$clubKey');

function nextTableSearch(
    next: TableState,
): (previous: TableSearch) => TableSearch {
    return (previous) => ({
        ...previous,
        dir: next.desc ? 'desc' : 'asc',
        page: next.page,
        pageSize: next.pageSize,
        sort: next.sort,
    });
}

export function ClubProfilePage(): JSX.Element {
    const { profile, clubs, topOpponents } = routeApi.useLoaderData();
    const navigate = useNavigate();
    const tableNavigate = routeApi.useNavigate();

    const onClubChange = useCallback(
        (clubKey: string) => {
            // Full replace with no search: switching clubs resets sort and
            // page, since page 3 of the previous club's results is not a
            // meaningful destination.
            void navigate({ params: { clubKey }, to: '/clubs/$clubKey' });
        },
        [navigate],
    );

    const onTableChange = useCallback(
        (next: TableState) => {
            void tableNavigate({
                resetScroll: false,
                search: nextTableSearch(next),
            });
        },
        [tableNavigate],
    );

    const clubOptions = useMemo(
        () => clubs.map((club) => ({ label: club.name, value: club.key })),
        [clubs],
    );

    const dark = isDarkAccent(profile.club.accent);
    const heroText = dark ? 'text-white' : 'text-ink';
    const heroSoft = dark ? 'text-white/75' : 'text-ink/65';

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <div className="mb-6 flex flex-col gap-4">
                <FieldSelect
                    label="Club"
                    wide
                    value={profile.club.key}
                    options={clubOptions}
                    onValueChange={onClubChange}
                />
                <span className="text-[13px] text-ink-muted">
                    Club profile · all grades, all covered seasons (archive and
                    PlayHQ)
                </span>
            </div>

            <div className="mb-6 grid gap-4 sm:gap-6 lg:grid-cols-[7fr_5fr]">
                <div
                    className={`flex min-h-[200px] flex-col justify-between rounded-panel p-6 sm:min-h-[220px] sm:p-8 ${accentBg(profile.club.accent)}`}
                >
                    <p className={`label-mono ${heroSoft}`}>
                        {isNull(profile.club.establishedYear) &&
                        isNull(profile.club.homeVenue)
                            ? 'FOUNDING YEAR AND HOME VENUE NOT PUBLISHED'
                            : [
                                  isNull(profile.club.establishedYear)
                                      ? null
                                      : `EST. ${String(profile.club.establishedYear)}`,
                                  profile.club.homeVenue?.toUpperCase() ?? null,
                              ]
                                  .filter(Boolean)
                                  .join(' · ')}
                    </p>
                    <div>
                        <h1
                            className={`text-3xl leading-none font-medium tracking-[-0.07rem] text-balance sm:text-5xl sm:tracking-[-0.09rem] lg:text-[3.5rem] lg:tracking-[-0.125rem] ${heroText}`}
                        >
                            {profile.club.name}
                        </h1>
                        <p className={`mt-4 text-base ${heroSoft}`}>
                            {isNull(profile.currentRank)
                                ? 'Not ranked in the most recent completed season'
                                : `Current rank #${String(profile.currentRank)}`}
                            {!isNull(profile.bestRank) &&
                                ` · best finish #${String(profile.bestRank)} in ${String(profile.bestRankYear)}`}
                        </p>
                    </div>
                </div>

                <ClubStatGrid profile={profile} />
            </div>

            <Panel className="mb-6 p-5 sm:p-8">
                <h2 className="text-lg font-semibold text-ink">
                    Club strength by season
                </h2>
                <div className="mt-6 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                    {/* Narrow screens scroll rather than shrink the year
                        labels past legibility. */}
                    <div className="min-w-[36rem] sm:min-w-[44rem]">
                        <TrendChart
                            points={profile.trend.overall}
                            title={`${profile.club.name}, all grades`}
                            accent={profile.club.accent}
                        />
                    </div>
                </div>
                <p className="mt-4 max-w-[46rem] text-sm text-ink-muted">
                    Strength is the club’s average finishing position across
                    every grade it fields, where 1.00 is top of the grade. It
                    ignores how many teams a club fields, so it answers “are our
                    teams doing better?” — unlike the championship ranking,
                    which rewards depth as well as performance.
                </p>
            </Panel>

            {/* Clubs with no graded finishes have no bands to break down. */}
            {profile.trend.bands.length > 0 && (
                <Panel className="mb-6 p-5 sm:p-8">
                    <h2 className="text-lg font-semibold text-ink">
                        Strength by grade band
                    </h2>
                    <p className="mt-1 max-w-[46rem] text-sm text-ink-muted">
                        Strongest band first. Every sparkline uses the same
                        0.00–1.00 axis, so bands can be compared against each
                        other, and the line breaks across seasons the club
                        fielded nothing in that band.
                    </p>
                    <div className="mt-6">
                        <BandTrendGrid
                            bands={profile.trend.bands}
                            clubName={profile.club.name}
                            accent={profile.club.accent}
                        />
                    </div>
                </Panel>
            )}

            <Panel className="mb-6 p-5 sm:p-8">
                <h2 className="text-lg font-semibold text-ink">
                    Championship points by season
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                    Bars take the club colour for a top-three finish. A dashed
                    slot means the season is not ranked yet.
                </p>
                <div className="mt-6 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                    <div className="max-w-[34rem] min-w-[20rem]">
                        <PointsBarChart
                            seasons={profile.seasons}
                            accent={profile.club.accent}
                        />
                    </div>
                </div>
            </Panel>

            <TopOpponentsPanel
                clubKey={profile.club.key}
                clubName={profile.club.name}
                opponents={topOpponents}
            />

            <h2 className="mb-4 text-lg font-semibold text-ink">
                Season by season, grade by grade
            </h2>
            {profile.totalRows > 0 ? (
                <ClubResultsTable
                    clubName={profile.club.name}
                    results={profile.results}
                    totalRows={profile.totalRows}
                    state={profile.tableState}
                    onChange={onTableChange}
                />
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {`${profile.club.name} has no graded ladder finishes in the covered seasons.`}
                    </p>
                </Panel>
            )}
        </PageShell>
    );
}
