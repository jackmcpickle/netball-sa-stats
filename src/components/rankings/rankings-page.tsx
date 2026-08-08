import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { RankMovementChart } from '@/components/charts/rank-movement-chart';
import { CoverageNote } from '@/components/coverage-note';
import { ChampionshipTable } from '@/components/rankings/championship-table';
import { Eyebrow, PageShell, Panel, StatFigure } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';

const routeApi = getRouteApi('/');

export function RankingsPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onSeasonChange = useCallback(
        (season: number) => {
            void navigate({ search: { season }, resetScroll: false });
        },
        [navigate],
    );

    const seasonOptions = useMemo(
        () =>
            data.coverage.rankedYears.map((year) => ({
                value: year,
                label: String(year),
            })),
        [data.coverage.rankedYears],
    );

    const firstRanked = data.coverage.rankedYears[0];
    const lastRanked = data.coverage.rankedYears.at(-1);
    const unrankedYears = data.coverage.years.filter(
        (year) => !data.coverage.rankedYears.includes(year),
    );

    return (
        <PageShell className="pb-24">
            <div className="grid items-end gap-8 pt-16 pb-12 lg:grid-cols-[7fr_5fr] lg:pt-20">
                <div>
                    <Eyebrow>
                        {`CLUB CHAMPIONSHIP · ${String(firstRanked)}—${String(lastRanked)}`}
                    </Eyebrow>
                    <h1 className="mt-5 text-[2.75rem] leading-[1.02] font-medium tracking-[-0.09rem] text-pretty text-ink sm:text-[3.5rem] sm:tracking-[-0.12rem] lg:text-display lg:tracking-[-0.156rem]">
                        {"Which club is really South Australia's strongest?"}
                    </h1>
                    <p className="mt-6 max-w-[52ch] text-lg leading-[1.55] text-ink-body">
                        {
                            'Every grade, every season, one number. Ladder finishes across Premier League, its Reserves and the Adelaide Metropolitan Netball Division are weighted by grade and added up into a single club championship score.'
                        }
                    </p>
                </div>

                <div className="grid gap-5 rounded-panel bg-paper-sunken p-8">
                    <StatFigure
                        size="lg"
                        value={data.coverage.rankedYears.length}
                        caption={`seasons ranked, ${String(firstRanked)}–${String(lastRanked)}`}
                    />
                    <div
                        aria-hidden="true"
                        className="h-px bg-rule-soft"
                    />
                    <div className="grid grid-cols-3 gap-4">
                        <StatFigure
                            size="sm"
                            value={data.clubCount}
                            caption="clubs"
                        />
                        <StatFigure
                            size="sm"
                            value={data.gradeCount}
                            caption="graded ladders"
                        />
                        <StatFigure
                            size="sm"
                            value={unrankedYears.length}
                            caption={
                                unrankedYears.length === 1
                                    ? `season in progress (${String(unrankedYears[0])})`
                                    : 'seasons in progress'
                            }
                        />
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <CoverageNote coverage={data.coverage} />
            </div>

            <Panel
                tone="raised"
                className="mb-12 p-6 sm:p-8"
            >
                <h2 className="text-2xl font-medium tracking-tight text-ink sm:text-panel">
                    {'Rank movement, season by season'}
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                    {`Club championship position across ${String(data.coverage.rankedYears.length)} ranked seasons. Lower is better. Lines break across years with no recovered data.`}
                </p>
                <div className="mt-6 overflow-x-auto">
                    <div className="min-w-[46rem]">
                        <RankMovementChart
                            series={data.series}
                            years={data.coverage.rankedYears}
                            worstRank={data.worstRank}
                        />
                    </div>
                </div>
            </Panel>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-6">
                <h2 className="text-3xl font-medium tracking-tight text-ink sm:text-title">
                    {`${String(data.season.year)} club championship`}
                </h2>
                <FieldSelect
                    label="Season"
                    value={data.season.year}
                    options={seasonOptions}
                    onValueChange={onSeasonChange}
                />
            </div>

            {data.season.rows.length > 0 ? (
                <ChampionshipTable
                    rows={data.season.rows}
                    year={data.season.year}
                    previousYear={data.previousYear}
                    coverageChanged={data.season.coverageChanged}
                />
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {`No club fielded a graded team in ${String(data.season.year)}, so there is nothing to rank.`}
                    </p>
                </Panel>
            )}
        </PageShell>
    );
}
