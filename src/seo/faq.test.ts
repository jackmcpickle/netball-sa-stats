import { describe, expect, it } from 'vitest';
import { buildClubFaq, buildHomeFaq, buildSiteFaq } from '@/seo/faq';
import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

const leader: ChampionshipLeader = {
    club: {
        accent: 'pink',
        establishedYear: null,
        homeVenue: null,
        key: 'contax',
        name: 'Contax',
    },
    points: 12,
    teams: 8,
};

function coverageOf(input: {
    readonly competitions?: Coverage['competitions'];
    readonly rankedYears: readonly number[];
    readonly timelineGaps?: Coverage['timelineGaps'];
}): Coverage {
    return {
        changeNote: null,
        competitions: input.competitions ?? [
            {
                competition: {
                    key: 'amnd',
                    name: 'Adelaide Metropolitan Netball Division',
                    shortName: 'AMND',
                },
                seasons: [
                    { note: null, status: 'ranked', year: 2024 },
                    {
                        note: 'Season still being played, so it is not ranked yet.',
                        status: 'in-progress',
                        year: 2026,
                    },
                ],
            },
            {
                competition: {
                    key: 'premier_league',
                    name: 'Netball SA Premier League',
                    shortName: 'PL',
                },
                seasons: [
                    { note: null, status: 'absent', year: 2022 },
                    { note: null, status: 'ranked', year: 2024 },
                ],
            },
        ],
        isSampleData: false,
        methodologyBreak: null,
        rankedYears: input.rankedYears,
        timelineGaps: input.timelineGaps ?? [
            { afterYear: 2014, missingYears: [2015] },
        ],
        years: input.rankedYears,
    };
}

function questions(
    entries: readonly { readonly question: string }[],
): string[] {
    return entries.map((entry) => entry.question);
}

describe(buildHomeFaq, () => {
    const coverage = coverageOf({ rankedYears: [2024, 2025] });

    it('names the DTO leader, not whoever happens to be first in season.rows', () => {
        const entries = buildHomeFaq({
            coverage,
            leader,
            season: { year: 2024 },
            totalRows: 3,
        });
        const leading = entries.find((entry) =>
            entry.question.includes('leading'),
        );
        expect(leading?.answer).toContain('Contax');
        expect(leading?.answer).toContain('2024');
    });

    it('omits the leader question when the season has no rank-1 row', () => {
        const entries = buildHomeFaq({
            coverage,
            leader: null,
            season: { year: 2024 },
            totalRows: 0,
        });
        expect(
            questions(entries).some((q) => q.includes('leading')),
        ).toBeFalsy();
        expect(
            entries.some((entry) => entry.answer.includes('0')),
        ).toBeTruthy();
    });

    it('counts clubs in this season, not all-time', () => {
        const entries = buildHomeFaq({
            coverage,
            leader,
            season: { year: 2024 },
            totalRows: 3,
        });
        const count = entries.find((entry) =>
            entry.question.includes('How many clubs'),
        );
        expect(count?.answer).toContain('3');
        expect(count?.answer).not.toContain('32');
    });

    it('names in-progress years and does not treat absent years as in progress', () => {
        const entries = buildHomeFaq({
            coverage: coverageOf({ rankedYears: [2024, 2025] }),
            leader,
            season: { year: 2025 },
            totalRows: 10,
        });
        const progress = entries.find((entry) =>
            entry.question.includes('in progress'),
        );
        expect(progress?.answer).toContain('2026');
        expect(progress?.answer).not.toContain('2022');
    });
});

describe(buildClubFaq, () => {
    const full = {
        profile: {
            bestRank: 1,
            bestRankYear: 2024,
            careerPoints: 40,
            club: { name: 'Contax' },
            currentRank: 2,
            minorPremierships: 3,
            winPercentage: 62.5,
        },
        topOpponents: [{ club: { name: 'Garville' }, played: 4 }],
    };

    it('answers rank, best finish, career totals, win rate and top opponent', () => {
        const entries = buildClubFaq(full);
        expect(questions(entries)).toHaveLength(5);
        expect(entries[0]?.answer).toContain('2nd');
        expect(entries[1]?.answer).toContain('2024');
        expect(entries[3]?.answer).toContain('62.5%');
        expect(entries[4]?.answer).toContain('Garville');
    });

    it('omits win-rate and opponent questions when those facts are missing', () => {
        const entries = buildClubFaq({
            profile: {
                ...full.profile,
                bestRank: null,
                bestRankYear: null,
                currentRank: null,
                winPercentage: null,
            },
            topOpponents: [],
        });
        expect(questions(entries)).toStrictEqual([
            'How many career championship points and minor premierships does Contax have?',
        ]);
    });
});

describe(buildSiteFaq, () => {
    const coverage = coverageOf({ rankedYears: [2000, 2024, 2025] });

    it('names the latest-season leader and the fixture year when both exist', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: 2025,
            latestRankedYear: 2025,
            leader,
        });
        const what = entries.find((entry) =>
            entry.question.includes('What is the South Australian'),
        );
        expect(what?.answer).toContain('Contax');
        expect(what?.answer).toContain('2025');
        const source = entries.find((entry) =>
            entry.question.includes('Where does the data'),
        );
        expect(source?.answer).toContain('2025');
        const find = entries.find((entry) =>
            entry.question.includes("find a club's results"),
        );
        expect(find?.answer).toContain('/clubs');
        expect(find?.answer).toContain('/results');
        expect(find?.answer).toContain('/head-to-head');
    });

    it('omits the fixture clause when there are no games', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: null,
            latestRankedYear: 2025,
            leader,
        });
        const source = entries.find((entry) =>
            entry.question.includes('Where does the data'),
        );
        expect(source?.answer).not.toContain('Fixture-level results');
    });

    it('names in-progress years and does not treat absent years as in progress', () => {
        const entries = buildSiteFaq({
            coverage,
            fixtureFromYear: null,
            latestRankedYear: 2025,
            leader: null,
        });
        const progress = entries.find((entry) =>
            entry.question.includes('in-progress seasons ranked'),
        );
        expect(progress?.answer).toContain('2026');
        expect(progress?.answer).not.toContain('2022');
        const what = entries.find((entry) =>
            entry.question.includes('What is the South Australian'),
        );
        expect(what?.answer).not.toContain('leads with');
    });
});
