/**
 * Markdown twins of the HTML pages. An agent that sends
 * `Accept: text/markdown`, or asks for `/ladders.md`, gets these instead of a
 * React shell — the same facts at a fraction of the tokens.
 *
 * Each renderer takes the page's own DTO, so it is pure and directly testable
 * against the fixtures the service tests already use.
 */
import { describeClub, ordinal } from '@/seo/descriptions';
import { HOME_FAQ, METHOD_FAQ } from '@/seo/faq';
import { frontMatter, section, table } from '@/seo/markdown/table';
import { absoluteUrl, SITE } from '@/seo/site';
import type { FaqEntry } from '@/seo/structured-data';
import type { ClubProfilePageDto } from '@/server/dto/club-profile.dto';
import type { ClubIndexPageDto } from '@/server/dto/clubs.dto';
import type { HeadToHeadPageDto } from '@/server/dto/head-to-head.dto';
import type { LaddersPageDto } from '@/server/dto/ladders.dto';
import type { MethodPageDto } from '@/server/dto/method.dto';
import type { RankingsPageDto } from '@/server/dto/rankings.dto';
import type { ResultsPageDto } from '@/server/dto/results.dto';
import type { Coverage } from '@/server/dto/shared.dto';

/** `Name (\`key\`)` for each grade, for the "Available" footer sections. */
function gradeListing(
    grades: readonly { readonly name: string; readonly key: string }[],
): string {
    return grades.map((grade) => `${grade.name} (\`${grade.key}\`)`).join(', ');
}

function header(input: {
    readonly title: string;
    readonly description: string;
    readonly path: string;
}): string {
    return [
        frontMatter({
            title: input.title,
            description: input.description,
            url: absoluteUrl(input.path),
            site: SITE.name,
        }),
        '',
        `# ${input.title}`,
        '',
        input.description,
    ].join('\n');
}

function faqBlock(entries: readonly FaqEntry[]): string {
    return section(
        '## Frequently asked questions',
        ...entries.flatMap((entry) => [
            `### ${entry.question}`,
            '',
            entry.answer,
            '',
        ]),
    );
}

function coverageBlock(coverage: Coverage): string {
    const rows = coverage.competitions.map((entry) => {
        const ranked = entry.seasons.filter(
            (season) => season.status === 'ranked',
        );
        const years = ranked.map((season) => season.year);
        return [
            entry.competition.name,
            years.length === 0
                ? '—'
                : `${Math.min(...years)}–${Math.max(...years)}`,
            String(ranked.length),
        ];
    });
    const gaps = coverage.timelineGaps.flatMap((gap) => gap.missingYears);
    return section(
        '## Coverage',
        table(['Competition', 'Ranked seasons', 'Count'], rows),
        '',
        gaps.length === 0
            ? 'No gaps in the covered years.'
            : `Years with no ranked season: ${gaps.join(', ')}.`,
        coverage.isSampleData
            ? '\n**Note:** the site is currently serving generated sample figures, not real results.'
            : '',
    );
}

export function renderRankings(data: RankingsPageDto): string {
    const rows = data.season.rows.map((row) => [
        row.rank,
        row.club.name,
        row.points,
        row.teams,
        row.winPercentage === null ? null : `${row.winPercentage.toFixed(1)}%`,
        row.minorPremierships,
        row.previousRank,
    ]);
    return [
        header({
            title: `Club championship ${data.season.year}`,
            description: `South Australian netball club championship standings for ${data.season.year}: ${data.clubCount} clubs across ${data.gradeCount} grades, scored from weighted ladder finishes.`,
            path: '/',
        }),
        '',
        section(
            `## Standings — ${data.season.year}`,
            table(
                [
                    'Rank',
                    'Club',
                    'Points',
                    'Teams',
                    'Win %',
                    'Minor premierships',
                    'Previous rank',
                ],
                rows,
            ),
        ),
        '',
        coverageBlock(data.coverage),
        '',
        faqBlock(HOME_FAQ),
        '',
        section(
            '## Other pages',
            '- [Ladders](/ladders.md) — every grade ladder',
            '- [Clubs](/clubs.md) — club index and profiles',
            '- [Results](/results.md) — fixture-level results from 2025',
            '- [Head to head](/head-to-head.md) — records between two clubs',
            '- [Method](/method.md) — how the score is built',
        ),
    ].join('\n');
}

export function renderLadders(data: LaddersPageDto): string {
    const { ladder } = data;
    const body =
        ladder === null
            ? '_No ladder is available for this season and grade._'
            : section(
                  `## ${ladder.grade.name} — ${ladder.grade.year} (${ladder.grade.competition.name}, ${ladder.grade.teamCount} teams)`,
                  table(
                      [
                          'Pos',
                          'Team',
                          'P',
                          'W',
                          'L',
                          'D',
                          'GF',
                          'GA',
                          '%',
                          'Pts',
                      ],
                      ladder.rows.map((row) => [
                          row.position,
                          row.displayName,
                          row.played,
                          row.won,
                          row.lost,
                          row.drawn,
                          row.goalsFor,
                          row.goalsAgainst,
                          row.percentage === null
                              ? null
                              : row.percentage.toFixed(1),
                          row.points,
                      ]),
                  ),
              );
    return [
        header({
            title: 'Ladders',
            description:
                'Grade ladders for South Australian netball — position, played, won, lost, goals and percentage for every team.',
            path: '/ladders',
        }),
        '',
        body,
        '',
        section(
            '## Available',
            `Seasons: ${data.years.join(', ')}.`,
            '',
            `Grades in ${data.year ?? '—'}: ${gradeListing(data.grades)}.`,
            '',
            'Add `?year=YYYY&grade=GRADE_KEY` to this URL for another ladder.',
        ),
    ].join('\n');
}

export function renderResults(data: ResultsPageDto): string {
    const { fixtures } = data;
    const body =
        fixtures === null
            ? '_No fixtures are available for this season and grade._'
            : section(
                  `## ${fixtures.grade.name} — ${fixtures.grade.year} (${fixtures.grade.competition.name})`,
                  table(
                      ['Round', 'Home', 'Score', 'Away', 'Margin', 'Status'],
                      fixtures.rows.map((row) => [
                          row.roundName ?? row.round,
                          row.homeTeamName,
                          row.homeScore === null || row.awayScore === null
                              ? null
                              : `${row.homeScore}–${row.awayScore}`,
                          row.awayTeamName,
                          row.margin,
                          row.status,
                      ]),
                  ),
              );
    return [
        header({
            title: 'Results',
            description:
                'Fixture-by-fixture South Australian netball results. Fixture-level data covers 2025 onwards only.',
            path: '/results',
        }),
        '',
        body,
        '',
        section(
            '## Available',
            `Seasons: ${data.years.join(', ')}.`,
            '',
            `Grades in ${data.year ?? '—'}: ${gradeListing(data.grades)}.`,
            '',
            'Add `?year=YYYY&grade=GRADE_KEY` to this URL for another grade.',
        ),
    ].join('\n');
}

export function renderClubIndex(data: ClubIndexPageDto): string {
    return [
        header({
            title: 'Clubs',
            description: `Every South Australian netball club in the dataset — ${data.presentCount} currently fielding teams, ${data.totalCount} in total.`,
            path: '/clubs',
        }),
        '',
        section(
            `## Clubs — ${data.year}`,
            table(
                ['Rank', 'Club', 'Points', 'Teams', 'Last ranked', 'Page'],
                data.entries.map((entry) => [
                    entry.rank,
                    entry.club.name,
                    entry.points,
                    entry.teams,
                    entry.lastRankedYear,
                    `/clubs/${entry.club.key}.md`,
                ]),
            ),
        ),
        '',
        data.includePast
            ? 'Includes clubs no longer fielding teams.'
            : 'Add `?includePast=true` to include clubs no longer fielding teams.',
    ].join('\n');
}

export function renderClubProfile(data: ClubProfilePageDto): string {
    const { profile } = data;
    const seasons = table(
        ['Year', 'Rank', 'Points', 'Status'],
        profile.seasons.map((season) => [
            season.year,
            season.rank,
            season.points,
            season.status,
        ]),
    );
    const results = table(
        ['Year', 'Grade', 'Competition', 'Finish', 'W', 'L', 'D'],
        profile.results.map((result) => [
            result.year,
            result.gradeName,
            result.competitionName,
            `${ordinal(result.ladderPosition)} of ${result.teamCount}`,
            result.won,
            result.lost,
            result.drawn,
        ]),
    );
    return [
        header({
            title: profile.club.name,
            description: describeClub(profile),
            path: `/clubs/${profile.club.key}`,
        }),
        '',
        section(
            '## Summary',
            table(
                ['Measure', 'Value'],
                [
                    ['Current rank', profile.currentRank],
                    [
                        'Best rank',
                        profile.bestRank === null
                            ? null
                            : `${profile.bestRank} (${profile.bestRankYear ?? '—'})`,
                    ],
                    ['Career championship points', profile.careerPoints],
                    ['Minor premierships', profile.minorPremierships],
                    [
                        'Win percentage (2022+)',
                        profile.winPercentage === null
                            ? null
                            : `${profile.winPercentage.toFixed(1)}%`,
                    ],
                    ['Games played (2022+)', profile.gamesPlayed],
                    ['Home venue', profile.club.homeVenue],
                ],
            ),
        ),
        '',
        section('## Season by season', seasons),
        '',
        section('## Grade finishes (page 1)', results),
        '',
        profile.totalRows > profile.results.length
            ? `Showing ${profile.results.length} of ${profile.totalRows} finishes. Add \`?page=2\` for more.`
            : '',
        '',
        data.topOpponents.length === 0
            ? ''
            : section(
                  '## Most-played opponents (2025+)',
                  table(
                      ['Club', 'Meetings', 'Head to head'],
                      data.topOpponents.map((opponent) => [
                          opponent.club.name,
                          opponent.played,
                          `/head-to-head.md?a=${profile.club.key}&b=${opponent.club.key}`,
                      ]),
                  ),
              ),
    ].join('\n');
}

export function renderHeadToHead(data: HeadToHeadPageDto): string {
    const { a, b, h2h } = data;
    // Records are always from A's perspective, so B's column is the mirror.
    const body =
        a === null || b === null || h2h === null
            ? '_Pick two clubs with `?a=CLUB_KEY&b=CLUB_KEY`. Club keys are listed below._'
            : section(
                  `## ${a.name} vs ${b.name}`,
                  table(
                      ['Measure', a.name, b.name],
                      [
                          ['Played', h2h.record.played, h2h.record.played],
                          ['Won', h2h.record.won, h2h.record.lost],
                          ['Drawn', h2h.record.drawn, h2h.record.drawn],
                          [
                              'Goals',
                              h2h.record.goalsFor,
                              h2h.record.goalsAgainst,
                          ],
                      ],
                  ),
                  '',
                  '### Meetings',
                  table(
                      ['Year', 'Grade', 'Round', 'Score', `${a.name} result`],
                      (data.meetings?.rows ?? h2h.meetings).map((meeting) => [
                          meeting.year,
                          meeting.gradeName,
                          meeting.roundName ?? meeting.round,
                          meeting.scoreA === null || meeting.scoreB === null
                              ? null
                              : `${meeting.scoreA}–${meeting.scoreB}`,
                          meeting.result,
                      ]),
                  ),
              );
    return [
        header({
            title: 'Head to head',
            description:
                'Head-to-head records between South Australian netball clubs. Fixture-level data covers meetings from 2025 onwards.',
            path: '/head-to-head',
        }),
        '',
        body,
        '',
        section(
            '## Clubs',
            data.clubs
                .map((club) => `- ${club.name} — \`${club.key}\``)
                .join('\n'),
        ),
    ].join('\n');
}

export function renderMethod(data: MethodPageDto): string {
    return [
        header({
            title: 'Method',
            description:
                'How the South Australian netball club championship is calculated: grade weightings, ranked seasons, and documented data gaps.',
            path: '/method',
        }),
        '',
        section(
            '## Scoring',
            "A club's championship score for a season is the sum, across every grade it fields a team in, of its ladder position converted to points — first in a grade of ten earns ten, second earns nine — with each grade multiplied by a weight reflecting its standard.",
            '',
            'From 2022 positions come from published PlayHQ regular-season ladders, not finals. Two points for a win, one for a draw; teams level on points are separated by goal percentage (goals for ÷ goals against × 100).',
            '',
            'Earlier AMND seasons (2000–2014 and 2016) come from archived Final Premiership Placings PDFs. Those rows are placement-only, and the top four may reflect finals rather than the minor-round ladder, so they score but cannot award a minor premiership.',
            '',
            'Seasons still being played are excluded: a mid-season ladder is not a finish.',
        ),
        '',
        data.updatedAt === null
            ? ''
            : `_Data last updated ${new Date(data.updatedAt * 1000).toISOString().slice(0, 10)}._`,
        '',
        section(
            '## Grade weights',
            table(
                ['Grade', 'Competition', 'Tier', 'Division', 'Weight'],
                data.weights.map((weight) => [
                    weight.label,
                    weight.competitionName,
                    weight.tier,
                    weight.division,
                    weight.weight,
                ]),
            ),
        ),
        '',
        coverageBlock(data.coverage),
        '',
        faqBlock(METHOD_FAQ),
    ].join('\n');
}

/** Static prose twin of `/about`. */
export function renderAbout(): string {
    return [
        header({
            title: 'About',
            description:
                'Netball Open Data is an independent, non-commercial project turning published South Australian netball ladders into one comparable club championship score per season.',
            path: '/about',
        }),
        '',
        section(
            '## Independence',
            'Not run by, affiliated with, or endorsed by Netball SA, the Adelaide Metropolitan Netball Division, or any club.',
        ),
        '',
        section(
            '## Sources',
            'PlayHQ ladders and fixtures for Netball SA and AMND competitions from 2022 onward, plus archived AMND Final Premiership Placings PDFs for earlier seasons. Nothing is estimated or interpolated; seasons with no recoverable source are shown as gaps.',
        ),
        '',
        section(
            '## Machine access',
            'Append `.md` to any URL, or send `Accept: text/markdown`.',
            '',
            '- `/llms.txt` — site index for language models',
            '- `/llms-full.txt` — core pages as one document',
            '- `/sitemap.xml` — every indexable URL',
            '- `/robots.txt` — crawling and citation are explicitly permitted',
        ),
    ].join('\n');
}
