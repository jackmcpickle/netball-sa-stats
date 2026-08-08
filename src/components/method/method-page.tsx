import { getRouteApi } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CoverageNote } from '@/components/coverage-note';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';

const routeApi = getRouteApi('/method');

export function MethodPage(): JSX.Element {
    const { coverage, weights, isSampleData } = routeApi.useLoaderData();

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'METHOD & DATA'}</Eyebrow>
            <div className="mt-4 mb-10">
                <PageTitle>{'How the championship score is built'}</PageTitle>
            </div>

            <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:gap-12">
                <div className="max-w-[62ch]">
                    <p className="text-lg leading-[1.55] text-ink-body">
                        {
                            "A club's championship score for a season is the sum, across every grade it fields a team in, of its ladder position converted to points — a team finishing first in a grade of ten earns ten, second earns nine, and so on — with each grade multiplied by a weight reflecting its standard."
                        }
                    </p>
                    <p className="mt-5 leading-[1.55] text-ink-body">
                        {
                            'Weights run from 1.0 for Premier Division down to the low tenths for junior and lower metro divisions. This rewards depth as well as a strong top team: a club fielding eight sides that all finish mid-table can outscore a club with one ladder-winning team and nothing else.'
                        }
                    </p>
                    <p className="mt-5 leading-[1.55] text-ink-body">
                        {
                            'From 2022, positions are taken from the published PlayHQ regular-season ladder, not from finals. Two points for a win and one for a draw; teams level on points are separated by goal percentage (goals for ÷ goals against × 100), the standard Netball SA method.'
                        }
                    </p>
                    <p className="mt-5 leading-[1.55] text-ink-body">
                        {
                            'Earlier AMND seasons (2000–2014 and 2016) come from archived Final Premiership Placings PDFs. Those rows are placement-only — no played/won/lost or goals — and the top four places may reflect finals outcomes rather than the minor-round ladder. They still score in the championship, but an uncertain top-four finish cannot count as a minor premiership, and the site draws a break across the missing years and the methodology change.'
                        }
                    </p>
                    <p className="mt-5 leading-[1.55] text-ink-body">
                        {
                            'The size of a grade matters, so it is stored with every ladder: fourth of six is not fourth of fourteen, and the site never shows a position without its field size. Seasons still being played are excluded from the rankings, because a mid-season ladder is not a finish.'
                        }
                    </p>

                    {isSampleData && (
                        <section
                            aria-labelledby="sample-data-heading"
                            className="mt-10 rounded-panel bg-accent-apricot p-8"
                        >
                            <h2
                                id="sample-data-heading"
                                className="text-2xl font-semibold tracking-tight text-ink"
                            >
                                {'This is sample data'}
                            </h2>
                            <p className="mt-3 leading-[1.55] text-ink">
                                {
                                    'Every figure on this site is synthetic, generated to demonstrate the structure. The club names, competition names, grade names, grade weights and season calendar are real and come from the Netball SA and AMND imports. The ladder positions, scores and rankings do not.'
                                }
                            </p>
                        </section>
                    )}
                </div>

                <div>
                    <h2 className="mb-4 text-lg font-semibold text-ink">
                        {'Grade weights'}
                    </h2>
                    <TableFrame>
                        <Table caption="Championship weight applied to each grade">
                            <thead>
                                <tr>
                                    <Th>{'GRADE'}</Th>
                                    <Th>{'COMPETITION'}</Th>
                                    <Th align="right">{'WEIGHT'}</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {weights.map((weight, index) => (
                                    <Tr
                                        key={`${weight.competitionName}-${weight.label}`}
                                        index={index}
                                    >
                                        <Td emphasis="strong">
                                            {weight.label}
                                        </Td>
                                        <Td emphasis="quiet">
                                            {weight.competitionName}
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric text-ink">
                                                {weight.weight.toFixed(2)}
                                            </span>
                                        </Td>
                                    </Tr>
                                ))}
                            </tbody>
                        </Table>
                    </TableFrame>
                    <p className="mt-4 text-[13px] text-ink-muted">
                        {
                            'Weights are stored per grade and applied at query time, so re-weighting re-ranks every season without a re-import.'
                        }
                    </p>
                </div>
            </div>

            <div className="mt-12">
                <CoverageNote coverage={coverage} />
            </div>
        </PageShell>
    );
}
