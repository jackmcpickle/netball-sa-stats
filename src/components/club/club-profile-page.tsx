import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { accentBg, isDarkAccent } from '@/components/accent';
import { PointsBarChart } from '@/components/charts/points-bar-chart';
import { ClubResultsTable } from '@/components/club/club-results-table';
import { formatNumber, formatPercent, NO_VALUE } from '@/components/format';
import { PageShell, Panel, StatFigure } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';

const routeApi = getRouteApi('/clubs/$clubKey');

export function ClubProfilePage(): JSX.Element {
    const { profile, clubs } = routeApi.useLoaderData();
    const navigate = useNavigate();

    const onClubChange = useCallback(
        (clubKey: string) => {
            void navigate({ to: '/clubs/$clubKey', params: { clubKey } });
        },
        [navigate],
    );

    const clubOptions = useMemo(
        () => clubs.map((club) => ({ value: club.key, label: club.name })),
        [clubs],
    );

    const dark = isDarkAccent(profile.club.accent);
    const heroText = dark ? 'text-white' : 'text-ink';
    const heroSoft = dark ? 'text-white/75' : 'text-ink/65';

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <FieldSelect
                    label="Club"
                    wide
                    value={profile.club.key}
                    options={clubOptions}
                    onValueChange={onClubChange}
                />
                <span className="text-[13px] text-ink-muted">
                    {'Club profile · all grades, all covered seasons'}
                </span>
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-[7fr_5fr]">
                <div
                    className={`flex min-h-[220px] flex-col justify-between rounded-panel p-8 ${accentBg(profile.club.accent)}`}
                >
                    <p className={`label-mono ${heroSoft}`}>
                        {profile.club.establishedYear === null &&
                        profile.club.homeVenue === null
                            ? 'FOUNDING YEAR AND HOME VENUE NOT PUBLISHED'
                            : [
                                  profile.club.establishedYear === null
                                      ? null
                                      : `EST. ${String(profile.club.establishedYear)}`,
                                  profile.club.homeVenue?.toUpperCase() ?? null,
                              ]
                                  .filter(Boolean)
                                  .join(' · ')}
                    </p>
                    <div>
                        <h1
                            className={`text-4xl leading-none font-medium tracking-[-0.09rem] text-balance sm:text-5xl lg:text-[3.5rem] lg:tracking-[-0.125rem] ${heroText}`}
                        >
                            {profile.club.name}
                        </h1>
                        <p className={`mt-4 text-base ${heroSoft}`}>
                            {profile.currentRank === null
                                ? 'Not ranked in the most recent completed season'
                                : `Current rank #${String(profile.currentRank)}`}
                            {profile.bestRank !== null &&
                                ` · best finish #${String(profile.bestRank)} in ${String(profile.bestRankYear)}`}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-card bg-paper-sunken p-6">
                        <StatFigure
                            value={formatNumber(profile.careerPoints, 0)}
                            caption="championship points, all seasons"
                        />
                    </div>
                    <div className="rounded-card bg-paper-sunken p-6">
                        <StatFigure
                            value={profile.minorPremierships}
                            caption="grade ladders topped"
                        />
                    </div>
                    <div className="rounded-card bg-paper-sunken p-6">
                        <StatFigure
                            value={formatPercent(profile.winPercentage)}
                            caption="win rate across all grades"
                        />
                    </div>
                    <div className="rounded-card bg-paper-sunken p-6">
                        <StatFigure
                            value={
                                profile.gamesPlayed > 0
                                    ? profile.gamesPlayed
                                    : NO_VALUE
                            }
                            caption="games played"
                        />
                    </div>
                </div>
            </div>

            <Panel className="mb-6 p-6 sm:p-8">
                <h2 className="text-lg font-semibold text-ink">
                    {'Championship points by season'}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                    {
                        'Bars take the club colour for a top-three finish. A dashed slot means the season is not ranked yet.'
                    }
                </p>
                <div className="mt-6 overflow-x-auto">
                    <div className="max-w-[34rem] min-w-[20rem]">
                        <PointsBarChart
                            seasons={profile.seasons}
                            accent={profile.club.accent}
                        />
                    </div>
                </div>
            </Panel>

            <h2 className="mb-4 text-lg font-semibold text-ink">
                {'Season by season, grade by grade'}
            </h2>
            {profile.results.length > 0 ? (
                <ClubResultsTable
                    clubName={profile.club.name}
                    results={profile.results}
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
