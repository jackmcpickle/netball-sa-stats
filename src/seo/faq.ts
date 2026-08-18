/**
 * Question-and-answer pairs rendered on the page *and* emitted as FAQPage
 * JSON-LD. One source, so the schema can never drift from what a reader sees
 * — Google and AI crawlers both penalise schema that is not on the page.
 *
 * Answers restate the Method page in plain, self-contained sentences: an
 * answer lifted out of context still has to be true.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { ordinal } from '@/seo/descriptions';
import type { FaqEntry } from '@/seo/structured-data';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

export const METHOD_FAQ: readonly FaqEntry[] = [
    {
        answer: 'Each grade carries a published weight reflecting its standard, running from 1.0 for Premier Division down to the low tenths for junior and lower metro divisions. Every weight in use is listed in the grade weights table on the Method page.',
        question: 'How are grade weights chosen?',
    },
    {
        answer: 'No. From 2022, positions are taken from the published PlayHQ regular-season ladder, not from finals. Ladders cover the regular season only, and finals are flagged separately and excluded when fixtures are reconciled against a ladder.',
        question: 'Do finals count toward the championship score?',
    },
    {
        answer: 'AMND seasons from 2000 to 2014 and 2016 come from Final Premiership Placings PDFs. Those rows are placement-only and the top four places may reflect finals outcomes rather than the minor-round ladder, so an uncertain top-four finish still scores in the championship but cannot count as a minor premiership.',
        question: 'Why can an archived season not award a minor premiership?',
    },
    {
        answer: 'By goal percentage — goals for ÷ goals against × 100 — which is the standard Netball SA method. Ladders award two points for a win and one for a draw.',
        question: 'How are teams level on points separated?',
    },
    {
        answer: 'A forfeit is recorded by PlayHQ as a nominal 0–20, so it counts toward won–lost–drawn but contributes no goals and shows no margin. Byes are stored as fixtures with one side, and a scheduled final with undecided sides appears in the grade’s fixture list rather than being dropped.',
        question: 'How are forfeits and byes handled?',
    },
    {
        answer: 'Archive rows carry a placement and nothing else — no played, won, lost or goals — so there is no basis for a rate. Win rate and games played are therefore shown from 2022 onward only.',
        question: 'Why is win rate missing before 2022?',
    },
];

function joinAnd(items: readonly string[]): string {
    if (items.length === 0) {
        return '';
    }
    if (items.length === 1) {
        return items[0] ?? '';
    }
    return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

function inProgressYears(coverage: Coverage): readonly number[] {
    const years = new Set<number>();
    for (const entry of coverage.competitions) {
        for (const season of entry.seasons) {
            if (season.status === 'in-progress') {
                years.add(season.year);
            }
        }
    }
    return [...years].toSorted((left, right) => left - right);
}

function progressClause(coverage: Coverage): string {
    const years = inProgressYears(coverage).map(String);
    if (years.length === 0) {
        return 'No season is currently in progress.';
    }
    const verb = years.length === 1 ? 'is' : 'are';
    return `${joinAnd(years)} ${verb} still in progress and ${verb} not ranked.`;
}

export function buildHomeFaq(data: {
    readonly coverage: Coverage;
    readonly leader: ChampionshipLeader | null;
    readonly season: { readonly year: number };
    readonly totalRows: number;
}): readonly FaqEntry[] {
    const { year } = data.season;
    const entries: FaqEntry[] = [];
    if (!isNull(data.leader)) {
        entries.push({
            answer: `${data.leader.club.name} is leading the ${String(year)} club championship with ${data.leader.points.toLocaleString('en-AU')} points from ${String(data.leader.teams)} teams.`,
            question: `Who is leading the ${String(year)} club championship?`,
        });
    }
    entries.push({
        answer: `${String(data.totalRows)} clubs are in the ${String(year)} championship standings.`,
        question: `How many clubs are in the ${String(year)} standings?`,
    });
    const ranked = data.coverage.rankedYears;
    const span =
        ranked.length === 0
            ? 'No seasons are ranked yet.'
            : `${String(ranked.length)} seasons are ranked, from ${String(Math.min(...ranked))}–${String(Math.max(...ranked))}.`;
    entries.push({
        answer: `${span} ${progressClause(data.coverage)}`,
        question:
            'How many seasons are ranked, and is a season still in progress?',
    });
    return entries;
}

export function buildClubFaq(data: {
    readonly profile: {
        readonly bestRank: number | null;
        readonly bestRankYear: number | null;
        readonly careerPoints: number;
        readonly club: { readonly name: string };
        readonly currentRank: number | null;
        readonly minorPremierships: number;
        readonly winPercentage: number | null;
    };
    readonly topOpponents: readonly {
        readonly club: { readonly name: string };
        readonly played: number;
    }[];
}): readonly FaqEntry[] {
    const { name } = data.profile.club;
    const entries: FaqEntry[] = [];
    if (!isNull(data.profile.currentRank)) {
        entries.push({
            answer: `${name} is ranked ${ordinal(data.profile.currentRank)} in the latest ranked season.`,
            question: `What is ${name}'s latest championship rank?`,
        });
    }
    if (!isNull(data.profile.bestRank) && !isNull(data.profile.bestRankYear)) {
        entries.push({
            answer: `${name}'s best championship finish is ${ordinal(data.profile.bestRank)} in ${String(data.profile.bestRankYear)}.`,
            question: `What is ${name}'s best championship finish?`,
        });
    }
    entries.push({
        answer: `${name} has ${data.profile.careerPoints.toLocaleString('en-AU')} career championship points and ${String(data.profile.minorPremierships)} minor premierships.`,
        question: `How many career championship points and minor premierships does ${name} have?`,
    });
    if (!isNull(data.profile.winPercentage)) {
        entries.push({
            answer: `${name}'s win rate since 2022 is ${data.profile.winPercentage.toFixed(1)}%.`,
            question: `What is ${name}'s win rate since 2022?`,
        });
    }
    const [opponent] = data.topOpponents;
    if (!isUndefined(opponent)) {
        entries.push({
            answer: `${name} has played ${opponent.club.name} most often since 2025, with ${String(opponent.played)} meetings.`,
            question: `Who has ${name} played most often since 2025?`,
        });
    }
    return entries;
}

function coverageAnswer(coverage: Coverage): string {
    const names = coverage.competitions.map((entry) => entry.competition.name);
    const listed =
        names.length === 0
            ? 'No competitions are in the dataset yet'
            : joinAnd(names);
    const span =
        coverage.rankedYears.length === 0
            ? 'There are no ranked seasons yet'
            : `Ranked seasons run ${String(Math.min(...coverage.rankedYears))}–${String(Math.max(...coverage.rankedYears))}`;
    const gapYears = coverage.timelineGaps.flatMap((gap) => gap.missingYears);
    const gaps =
        gapYears.length === 0
            ? 'There are no gaps in the covered years.'
            : `${joinAnd(gapYears.map(String))} are not covered, and the site marks those gaps rather than interpolating them.`;
    return `${listed}. ${span}. Seasons from 2022 use published PlayHQ regular-season ladders; earlier AMND seasons come from archived Final Premiership Placings PDFs where those survive. ${gaps}`;
}

export function buildSiteFaq(data: {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}): readonly FaqEntry[] {
    const what = [
        "It is a single score per club per season, published on this site. A club's championship score is the sum, across every grade it fields a team in, of its ladder finish converted to points and multiplied by that grade's weight. It rewards both finishing high and fielding depth, so it is not an official Netball SA award — it is an open, reproducible ranking built from published ladders.",
    ];
    if (!isNull(data.leader) && !isNull(data.latestRankedYear)) {
        what.push(
            ` In ${String(data.latestRankedYear)}, ${data.leader.club.name} leads with ${data.leader.points.toLocaleString('en-AU')} championship points from ${String(data.leader.teams)} teams.`,
        );
    }
    const fixture = isNull(data.fixtureFromYear)
        ? ''
        : ` Fixture-level results — round, date, both sides and the score — exist from ${String(data.fixtureFromYear)} onward, so head-to-head records cover meetings since ${String(data.fixtureFromYear)} rather than all time.`;
    const findFixture = isNull(data.fixtureFromYear)
        ? ''
        : ` Fixture-level pages cover ${String(data.fixtureFromYear)} onward.`;
    return [
        {
            answer: what.join(''),
            question: 'What is the South Australian netball club championship?',
        },
        {
            answer: coverageAnswer(data.coverage),
            question: 'Which competitions and seasons are covered?',
        },
        {
            answer: 'For each team, a ladder finish is converted to points by field size: first in a grade of ten earns ten points, second earns nine, and so on. Each grade is then multiplied by a weight reflecting its standard, from 1.0 for Premier Division down to the low tenths for junior and lower metro divisions. The club’s score for the season is the sum across all of its teams.',
            question: 'How is a club championship score calculated?',
        },
        {
            answer: 'Championship score sums across teams, so fielding more teams raises it. Club strength averages: for one team it is (team_count − ladder_position) ÷ (team_count − 1), giving 1.00 for topping a grade and 0.00 for finishing bottom, and a club’s strength is the mean across its teams. A club that cuts from eight teams to five strong ones can show rising strength and falling championship points in the same season.',
            question:
                'What is the difference between championship score and club strength?',
        },
        {
            answer: `Published PlayHQ ladders and fixtures for Netball SA and AMND from 2022 onward, and archived AMND Final Premiership Placings PDFs for earlier seasons.${fixture}`,
            question: 'Where does the data come from?',
        },
        {
            answer: `No. A mid-season ladder is not a finish, so seasons still being played are shown as in progress and excluded from the championship rankings until they complete. ${progressClause(data.coverage)}`,
            question: 'Are in-progress seasons ranked?',
        },
        {
            answer: `Open a club’s page from /clubs for championship rank, grade finishes and recent opponents. Fixture-by-fixture scores are on /results, and two-club records are on /head-to-head.${findFixture}`,
            question: "How do I find a club's results?",
        },
    ];
}
