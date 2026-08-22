import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import type { JSX } from 'react';
import { CoverageNote } from '@/components/coverage-note';
import { FaqSection } from '@/components/faq-section';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';
import { METHOD_FAQ } from '@/seo/faq';
import type { GradeWeightRow } from '@/server/dto/method.dto';

const routeApi = getRouteApi('/method');

/** The prose column: how the score is built, and the sample-data notice. */
function MethodNarrative({
    isSampleData,
}: {
    readonly isSampleData: boolean;
}): JSX.Element {
    return (
        <div className="max-w-[62ch]">
            <p className="text-lg leading-[1.55] text-ink-body">
                A club&rsquo;s championship score for a season is the sum,
                across every grade it fields a team in, of its ladder position
                converted to points — a team finishing first in a grade of ten
                earns ten, second earns nine, and so on — with each grade
                multiplied by a weight reflecting its standard.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                Weights run from 1.0 for Premier Division down to the low tenths
                for junior and lower metro divisions. This rewards depth as well
                as a strong top team: a club fielding eight sides that all
                finish mid-table can outscore a club with one ladder-winning
                team and nothing else.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                The championship table is AMND, Premier League and Reserves
                only. SAUCNA, Southern United, Hills, Mid Hills and Southern
                Hills are seeded in the competition catalogue so a fetch can
                target them the same way as AMND. They stay out of the score
                until someone writes calibrated weights. Mixing an unweighted
                country or church ladder into the metro championship would
                change ranks for no good reason.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                From 2022, positions are taken from the published PlayHQ
                regular-season ladder, not from finals. Two points for a win and
                one for a draw; teams level on points are separated by goal
                percentage (goals for ÷ goals against × 100), the standard
                Netball SA method.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                Earlier AMND seasons (2000–2014 and 2016) come from archived
                Final Premiership Placings PDFs. Those rows are placement-only —
                no played/won/lost or goals — and the top four places may
                reflect finals outcomes rather than the minor-round ladder. They
                still score in the championship, but an uncertain top-four
                finish cannot count as a minor premiership, and the site draws a
                break across the missing years and the methodology change.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                The size of a grade matters, so it is stored with every ladder:
                fourth of six is not fourth of fourteen, and the site never
                shows a position without its field size. Seasons still being
                played are excluded from the rankings, because a mid-season
                ladder is not a finish.
            </p>

            <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                Fixture-level results
            </h2>
            <p className="leading-[1.55] text-ink-body">
                The results and head-to-head pages are built from individual
                fixtures — round, date, both sides and the score. That import
                covers 2025 onwards only. Everything earlier on this site,
                including every championship figure, is derived from ladders,
                which record how a team finished but not who it beat along the
                way. A head-to-head record is therefore not a complete history
                of two clubs; it is a complete record of their meetings since
                2025.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                A forfeit is a result but not a scoreline: PlayHQ records a
                nominal 0–20 on forfeited fixtures, so those games count toward
                won–lost–drawn but contribute no goals and show no margin. Byes
                are stored as fixtures with one side, and a scheduled final can
                name no teams at all until the sides are decided — both appear
                in a grade’s fixture list rather than being quietly dropped.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                Ladders cover the regular season only, so finals are flagged
                separately and excluded when fixtures are reconciled against a
                ladder. Finals are labelled by name — “Grand Final”, not “round
                16”.
            </p>

            <h2 className="mt-10 mb-4 text-lg font-semibold text-ink">
                Club strength
            </h2>
            <p className="leading-[1.55] text-ink-body">
                A club profile also shows strength, a different number from the
                championship score, built to answer a different question. For
                one team in one grade, strength is (team_count −
                ladder_position) ÷ (team_count − 1): 1.00 for finishing top of
                the grade, 0.00 for finishing bottom. A club&rsquo;s strength
                for a season is the mean of that figure across every team it
                fields.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                That mean is deliberate, and it is the opposite choice to the
                championship score, which sums rather than averages and so
                rewards fielding more teams as well as finishing higher. A club
                that drops from eight teams to five, all finishing near the top
                of their grades, will show rising strength and falling
                championship points in the same season. Neither figure is wrong
                — they answer different questions, one about how well the
                club&rsquo;s teams perform, the other about how much of the
                competition the club occupies.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                Grades with only one team have no ladder position that means
                anything, so they are left out of the average rather than scored
                as a win or a loss.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                The by-band breakdown collapses divisions: Primary 1 and Primary
                7 both appear under Primary. The strength figure itself is
                always measured against the team’s own division ladder, so a
                club that shifts a team between divisions of the same grade
                usually does change strength.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                On a club page, the change figure under each band sparkline is
                the mean strength of the last N measured seasons minus the mean
                of the first N, where N is up to three. Bands with fewer than
                six measured seasons let those windows overlap, which is still
                steadier than comparing two single seasons.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                The same archive caveat that applies to the championship score
                applies here: pre-2022 placings come from Final Premiership
                Placings PDFs, and the top four may reflect finals rather than
                the minor-round ladder. Those placings are included, not
                discarded, because they are the best record that exists — and
                dropping them would remove exactly the results that matter most,
                the finals finishes clubs are remembered for.
            </p>
            <p className="mt-5 leading-[1.55] text-ink-body">
                Win rate and games played are only shown from 2022 onward,
                because archive rows carry a placement and nothing else — no
                played, won, lost or goals to compute a rate from.
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
                        This is sample data
                    </h2>
                    <p className="mt-3 leading-[1.55] text-ink">
                        Every figure on this site is synthetic, generated to
                        demonstrate the structure. The club names, competition
                        names, grade names, grade weights and season calendar
                        are real and come from the Netball SA and AMND imports.
                        The ladder positions, scores and rankings do not.
                    </p>
                </section>
            )}
        </div>
    );
}

/** The grade-weight table column. */
function MethodWeights({
    weights,
}: {
    readonly weights: readonly GradeWeightRow[];
}): JSX.Element {
    return (
        <div>
            <h2 className="mb-4 text-lg font-semibold text-ink">
                Grade weights
            </h2>
            <TableFrame>
                <Table
                    layout="compact"
                    caption="Championship weight applied to each grade"
                >
                    {' '}
                    <thead>
                        <tr>
                            <Th>GRADE</Th>
                            <Th>COMPETITION</Th>
                            <Th align="right">WEIGHT</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {weights.map((weight, index) => (
                            <Tr
                                key={`${weight.competitionName}-${weight.label}`}
                                index={index}
                            >
                                <Td emphasis="strong">{weight.label}</Td>
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
                Weights are stored per grade and applied at query time, so
                re-weighting re-ranks every season without a re-import.
            </p>
        </div>
    );
}

export function MethodPage(): JSX.Element {
    const { coverage, weights, isSampleData, updatedAt } =
        routeApi.useLoaderData();

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>METHOD & DATA</Eyebrow>
            <div className="mt-4 mb-10">
                <PageTitle>How the championship score is built</PageTitle>
                {!isNull(updatedAt) && (
                    <p className="mt-4 text-sm text-ink-muted">
                        {'Data last updated '}
                        <time
                            dateTime={new Date(updatedAt * 1000).toISOString()}
                        >
                            {new Date(updatedAt * 1000).toLocaleDateString(
                                'en-AU',
                                {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                },
                            )}
                        </time>
                        .
                    </p>
                )}
            </div>

            <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:gap-12">
                <MethodNarrative isSampleData={isSampleData} />

                <MethodWeights weights={weights} />
            </div>

            <div className="mt-12">
                <CoverageNote coverage={coverage} />
            </div>

            <FaqSection entries={METHOD_FAQ} />
        </PageShell>
    );
}
