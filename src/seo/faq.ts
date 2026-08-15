/**
 * Question-and-answer pairs rendered on the page *and* emitted as FAQPage
 * JSON-LD. One source, so the schema can never drift from what a reader sees
 * — Google and AI crawlers both penalise schema that is not on the page.
 *
 * Answers restate the Method page in plain, self-contained sentences: an
 * answer lifted out of context still has to be true.
 */
import type { FaqEntry } from '@/seo/structured-data';

export const HOME_FAQ: readonly FaqEntry[] = [
    {
        answer: "It is a single score per club per season, published on this site. A club's championship score is the sum, across every grade it fields a team in, of its ladder finish converted to points and multiplied by that grade's weight. It rewards both finishing high and fielding depth, so it is not an official Netball SA award — it is an open, reproducible ranking built from published ladders.",
        question: 'What is the South Australian netball club championship?',
    },
    {
        answer: 'The Adelaide Metropolitan Netball Division (AMND) from 2000, and the Netball SA Premier League and Reserves from 2023. Seasons from 2022 use published PlayHQ regular-season ladders; AMND seasons from 2000 to 2014 and 2016 come from archived Final Premiership Placings PDFs. 2015 and 2017 to 2021 are not covered, and the site marks those gaps rather than interpolating them.',
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
        answer: 'Published PlayHQ ladders and fixtures for Netball SA and AMND from 2022 onward, and archived AMND Final Premiership Placings PDFs for earlier seasons. Fixture-level results — round, date, both sides and the score — exist only from 2025, so head-to-head records cover meetings since 2025 rather than all time.',
        question: 'Where does the data come from?',
    },
    {
        answer: 'No. A mid-season ladder is not a finish, so seasons still being played are shown as in progress and excluded from the championship rankings until they complete.',
        question: 'Are in-progress seasons ranked?',
    },
];

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
