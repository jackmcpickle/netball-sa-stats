import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { RankMovementChart } from '@/components/charts/rank-movement-chart';
import { CoverageNote } from '@/components/coverage-note';
import { FaqSection } from '@/components/faq-section';
import { ChampionshipTable } from '@/components/rankings/championship-table';
import { Eyebrow, PageShell, Panel, StatFigure } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';
import type { TableState } from '@/db/queries/pagination';
import { buildHomeFaq } from '@/seo/faq';

const routeApi = getRouteApi('/');

export function RankingsPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onSeasonChange = useCallback(
        (season: number) => {
            void navigate({ resetScroll: false, search: { season } });
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

    const seasonOptions = useMemo(
        () =>
            data.coverage.rankedYears.map((year) => ({
                label: String(year),
                value: year,
            })),
        [data.coverage.rankedYears],
    );

    const [firstRanked] = data.coverage.rankedYears;
    const lastRanked = data.coverage.rankedYears.at(-1);
    const rankedYearSet = useMemo(
        () => new Set(data.coverage.rankedYears),
        [data.coverage.rankedYears],
    );
    const unrankedYears = data.coverage.years.filter(
        (year) => !rankedYearSet.has(year),
    );

    return (
        <PageShell className="pb-24">
            <div className="grid items-end gap-8 pt-12 pb-10 sm:pt-16 sm:pb-12 lg:grid-cols-[7fr_5fr] lg:pt-20">
                <div>
                    <Eyebrow>
                        {`AMND / PREMIER LEAGUE · ${String(firstRanked)} to ${String(lastRanked)}`}
                    </Eyebrow>
                    <h1 className="mt-5 text-[2.25rem] leading-[1.05] font-medium tracking-[-0.07rem] text-pretty text-ink sm:text-[3.5rem] sm:tracking-[-0.12rem] lg:text-display lg:tracking-[-0.156rem]">
                        Which AMND / Premier League club is really strongest?
                    </h1>
                    <p className="mt-5 max-w-[52ch] text-base leading-[1.55] text-ink-body sm:mt-6 sm:text-lg">
                        Every AMND, Premier League and Reserves grade, one
                        number. Those finishes are weighted by grade and added
                        up into a club championship score for this trio only.
                        Other associations have their own{' '}
                        <a
                            href="/leagues"
                            className="text-ink underline decoration-rule underline-offset-2"
                        >
                            league pages
                        </a>
                        . They are not in this score.
                    </p>
                </div>

                <div className="grid gap-5 rounded-panel bg-paper-sunken p-6 sm:p-8">
                    <StatFigure
                        size="lg"
                        value={data.coverage.rankedYears.length}
                        caption={`seasons ranked, ${String(firstRanked)}–${String(lastRanked)}`}
                    />
                    <div
                        aria-hidden="true"
                        className="h-px bg-rule-soft"
                    />
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
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
                className="mb-12 p-5 sm:p-8"
            >
                <h2 className="text-2xl font-medium tracking-tight text-ink sm:text-panel">
                    Rank movement, season by season
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                    {`Club championship position across ${String(data.coverage.rankedYears.length)} ranked seasons. Lower is better. Lines break across years with no recovered data.`}
                </p>
                <div className="mt-6 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                    <div className="min-w-[36rem] sm:min-w-[46rem]">
                        <RankMovementChart
                            series={data.series}
                            years={data.coverage.rankedYears}
                            worstRank={data.worstRank}
                        />
                    </div>
                </div>
            </Panel>

            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6">
                <h2 className="text-2xl font-medium tracking-tight text-ink sm:text-title">
                    {`${String(data.season.year)} club championship`}
                </h2>
                <FieldSelect
                    label="Season"
                    value={data.season.year}
                    options={seasonOptions}
                    onValueChange={onSeasonChange}
                />
            </div>

            {data.totalRows > 0 ? (
                <ChampionshipTable
                    rows={data.season.rows}
                    year={data.season.year}
                    previousYear={data.previousYear}
                    coverageChanged={data.season.coverageChanged}
                    totalRows={data.totalRows}
                    state={data.tableState}
                    onChange={onTableChange}
                />
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {`No club fielded a graded team in ${String(data.season.year)}, so there is nothing to rank.`}
                    </p>
                </Panel>
            )}

            <FaqSection entries={buildHomeFaq(data)} />
        </PageShell>
    );
}
