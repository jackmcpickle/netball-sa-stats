/**
 * Deterministic sample dataset.
 *
 * Club names, competition names, grade names, grade weights and the season
 * calendar are all real — lifted from `data/*.csv` — so that Task 6's swap to
 * the database changes numbers but not structure. Every ladder figure is
 * synthetic. Nothing here reads the filesystem or the database, so it runs
 * unchanged on the server and in the browser.
 */
import type {
    AccentName,
    ChampionshipRow,
    ChampionshipSeason,
    Club,
    ClubGradeResult,
    Competition,
    GradeSummary,
    GradeWeightRow,
    Ladder,
    LadderRow,
} from '@/data/types';

const ACCENTS: readonly AccentName[] = [
    'pink',
    'deep',
    'lilac',
    'gold',
    'coral',
    'mint',
    'apricot',
    'violet',
    'forest',
    'rust',
    'slate',
    'ochre',
    'steel',
    'olive',
];

const MODULUS = 2_147_483_647;

/**
 * Stable string hash, modular rather than bitwise so it reads as arithmetic
 * and satisfies the no-bitwise rule. Any stable hash would do.
 */
function hash(text: string): number {
    let h = 7;
    for (let i = 0; i < text.length; i += 1) {
        h = (h * 31 + text.charCodeAt(i)) % MODULUS;
    }
    return h;
}

/**
 * Lehmer generator. Seeded, so every render and every build produces exactly
 * the same site — a sample dataset that shifted underfoot would be useless for
 * comparing before and after.
 */
function randomFrom(seed: number): () => number {
    let t = seed % MODULUS;
    if (t <= 0) {
        t += MODULUS - 1;
    }
    return (): number => {
        t = (t * 16_807) % MODULUS;
        return (t - 1) / (MODULUS - 1);
    };
}

interface ClubSeed {
    readonly key: string;
    readonly name: string;
    /** Long-run strength, 0–1. Drives ladder finishes across every grade. */
    readonly strength: number;
}

const CLUB_SEEDS: readonly ClubSeed[] = [
    { key: 'contax', name: 'Contax', strength: 0.97 },
    { key: 'matrics', name: 'Matrics', strength: 0.94 },
    { key: 'garville', name: 'Garville', strength: 0.92 },
    { key: 'metro-jets', name: 'Metro Jets', strength: 0.86 },
    {
        key: 'tango-netball-club-inc',
        name: 'Tango Netball Club Inc',
        strength: 0.84,
    },
    { key: 'northeast-zodiac', name: 'Northeast Zodiac', strength: 0.8 },
    {
        key: 'reynella-netball-club',
        name: 'Reynella Netball Club',
        strength: 0.78,
    },
    {
        key: 'south-adelaide-netball-club',
        name: 'South Adelaide Netball Club',
        strength: 0.75,
    },
    { key: 'adelaide-university', name: 'Adelaide University', strength: 0.72 },
    {
        key: 'oakdale-netball-club-sa',
        name: 'Oakdale Netball Club (SA)',
        strength: 0.7,
    },
    {
        key: 'norwood-netball-club',
        name: 'Norwood Netball Club',
        strength: 0.67,
    },
    { key: 'walkerville', name: 'Walkerville', strength: 0.65 },
    {
        key: 'central-district-netball-club',
        name: 'Central District Netball Club',
        strength: 0.62,
    },
    {
        key: 'west-croydon-netball-club',
        name: 'West Croydon Netball Club',
        strength: 0.6,
    },
    { key: 'city-coasters', name: 'City Coasters', strength: 0.57 },
    { key: 'adelaide-wildcats', name: 'Adelaide Wildcats', strength: 0.55 },
    {
        key: 'phoenix-netball-club-sa',
        name: 'Phoenix Netball Club (SA)',
        strength: 0.52,
    },
    { key: 'sacred-heart-o-c', name: 'Sacred Heart O.C.', strength: 0.5 },
    { key: 'old-ignatians', name: 'Old Ignatians', strength: 0.47 },
    { key: 'pembroke-o-s', name: 'Pembroke O.S.', strength: 0.44 },
    { key: 'scotch-old-scholars', name: 'Scotch Old Scholars', strength: 0.41 },
    { key: 'semaphore', name: 'Semaphore', strength: 0.38 },
    {
        key: 'cheerio-netball-club',
        name: 'Cheerio Netball Club',
        strength: 0.35,
    },
    { key: 'dragons', name: 'Dragons', strength: 0.32 },
    { key: 'strikers-club', name: 'Strikers (Club)', strength: 0.28 },
];

export const CLUBS: readonly Club[] = CLUB_SEEDS.map((seed, i) => ({
    key: seed.key,
    name: seed.name,
    // PlayHQ publishes neither, and the import leaves both blank.
    establishedYear: null,
    homeVenue: null,
    accent: ACCENTS[i % ACCENTS.length],
}));

const CLUB_BY_KEY = new Map(CLUBS.map((club) => [club.key, club]));

export const COMPETITIONS: readonly Competition[] = [
    {
        key: 'amnd',
        name: 'Adelaide Metropolitan Netball Division',
        shortName: 'AMND',
    },
    {
        key: 'premier_league',
        name: 'Netball SA Premier League',
        shortName: 'Premier League',
    },
    {
        key: 'premier_league_reserves',
        name: 'Premier League Reserves',
        shortName: 'PL Reserves',
    },
];

const COMPETITION_BY_KEY = new Map(
    COMPETITIONS.map((competition) => [competition.key, competition]),
);

/** Lookup that fails loudly. Every key in this module is a literal we control. */
function competitionFor(key: string): Competition {
    const competition = COMPETITION_BY_KEY.get(key);
    if (!competition) {
        throw new Error(`Unknown competition: ${key}`);
    }
    return competition;
}

function clubFor(key: string): Club {
    const club = CLUB_BY_KEY.get(key);
    if (!club) {
        throw new Error(`Unknown club: ${key}`);
    }
    return club;
}

/** Every year the site holds data for. */
export const YEARS: readonly number[] = [2022, 2023, 2024, 2025, 2026];

/** Years with a complete championship. 2026 is still being played. */
export const RANKED_YEARS: readonly number[] = [2022, 2023, 2024, 2025];

interface GradeSeed {
    readonly slug: string;
    readonly name: string;
    readonly competitionKey: string;
    readonly tier: number;
    readonly division: number | null;
    readonly weight: number;
    /** Championship-standard grades draw the strongest clubs. */
    readonly standard: number;
    readonly teamCount: number;
    /** Years this grade ran. Premier League has no 2022 season. */
    readonly years: readonly number[];
}

const PREMIER_YEARS: readonly number[] = [2023, 2024, 2025, 2026];

const GRADE_SEEDS: readonly GradeSeed[] = [
    {
        slug: 'premier-division',
        name: 'Premier Division',
        competitionKey: 'premier_league',
        tier: 1,
        division: null,
        weight: 1,
        standard: 1,
        teamCount: 8,
        years: PREMIER_YEARS,
    },
    {
        slug: 'reserves-division',
        name: 'Reserves Division',
        competitionKey: 'premier_league_reserves',
        tier: 2,
        division: null,
        weight: 0.8,
        standard: 0.92,
        teamCount: 8,
        years: PREMIER_YEARS,
    },
    {
        slug: 'amnd',
        name: 'AMND',
        competitionKey: 'amnd',
        tier: 3,
        division: null,
        weight: 0.75,
        standard: 0.86,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'a-grade',
        name: 'A GRADE',
        competitionKey: 'amnd',
        tier: 4,
        division: null,
        weight: 0.68,
        standard: 0.78,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'b1',
        name: 'B1',
        competitionKey: 'amnd',
        tier: 5,
        division: 1,
        weight: 0.62,
        standard: 0.7,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'b2',
        name: 'B2',
        competitionKey: 'amnd',
        tier: 5,
        division: 2,
        weight: 0.59,
        standard: 0.64,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'b3',
        name: 'B3',
        competitionKey: 'amnd',
        tier: 5,
        division: 3,
        weight: 0.56,
        standard: 0.58,
        teamCount: 9,
        years: YEARS,
    },
    {
        slug: 'inter-1',
        name: 'INTER 1',
        competitionKey: 'amnd',
        tier: 6,
        division: 1,
        weight: 0.45,
        standard: 0.52,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'inter-2',
        name: 'INTER 2',
        competitionKey: 'amnd',
        tier: 6,
        division: 2,
        weight: 0.43,
        standard: 0.46,
        teamCount: 9,
        years: YEARS,
    },
    {
        slug: 'c1',
        name: 'C1',
        competitionKey: 'amnd',
        tier: 7,
        division: 1,
        weight: 0.36,
        standard: 0.4,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'c2',
        name: 'C2',
        competitionKey: 'amnd',
        tier: 7,
        division: 2,
        weight: 0.34,
        standard: 0.34,
        teamCount: 9,
        years: YEARS,
    },
    {
        slug: 'junior-1',
        name: 'Junior 1',
        competitionKey: 'amnd',
        tier: 8,
        division: 1,
        weight: 0.38,
        standard: 0.68,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'junior-2',
        name: 'Junior 2',
        competitionKey: 'amnd',
        tier: 8,
        division: 2,
        weight: 0.365,
        standard: 0.56,
        teamCount: 10,
        years: YEARS,
    },
    {
        slug: 'primary-1',
        name: 'Primary 1',
        competitionKey: 'amnd',
        tier: 10,
        division: 1,
        weight: 0.26,
        standard: 0.5,
        teamCount: 8,
        years: YEARS,
    },
];

export const GRADE_WEIGHTS: readonly GradeWeightRow[] = GRADE_SEEDS.map(
    (seed) => ({
        competitionName: competitionFor(seed.competitionKey).shortName,
        label: seed.name,
        tier: seed.tier,
        division: seed.division,
        weight: seed.weight,
    }),
);

function gradeKeyFor(seed: GradeSeed, year: number): string {
    return `${seed.competitionKey}-${String(year)}-${seed.slug}`;
}

function gradeSummary(seed: GradeSeed, year: number): GradeSummary {
    return {
        key: gradeKeyFor(seed, year),
        name: seed.name,
        year,
        competition: competitionFor(seed.competitionKey),
        teamCount: seed.teamCount,
    };
}

/** Every grade run in every covered year, ordered strongest grade first. */
export const GRADES: readonly GradeSummary[] = GRADE_SEEDS.flatMap((seed) =>
    seed.years.map((year) => gradeSummary(seed, year)),
);

interface GradeInstance {
    readonly seed: GradeSeed;
    readonly year: number;
}

/**
 * Keyed lookup for a grade in a specific year. The year is stored rather than
 * parsed back out of the key: slugs contain hyphens, so splitting the key is a
 * bug waiting to happen.
 */
const INSTANCE_BY_GRADE_KEY = new Map(
    GRADE_SEEDS.flatMap((seed) =>
        seed.years.map((year): [string, GradeInstance] => [
            gradeKeyFor(seed, year),
            { seed, year },
        ]),
    ),
);

/** Year-on-year wobble around a club's long-run strength. */
function formIn(club: ClubSeed, year: number): number {
    const jitter = randomFrom(hash(`${club.key}|${String(year)}`))();
    return club.strength * 0.82 + 0.09 + (jitter - 0.5) * 0.22;
}

/**
 * Which clubs enter a grade. Clubs whose strength sits near the grade's standard
 * are the likeliest entrants, which keeps the strong clubs in the strong grades
 * without making every ladder identical.
 */
function entrantsFor(seed: GradeSeed, year: number): readonly ClubSeed[] {
    return CLUB_SEEDS.map((club) => ({
        club,
        affinity:
            1 -
            Math.abs(club.strength - seed.standard) +
            randomFrom(hash(`${club.key}|${seed.slug}|${String(year)}`))() *
                0.5,
    }))
        .sort((a, b) => b.affinity - a.affinity)
        .slice(0, seed.teamCount)
        .map((entry) => entry.club);
}

function buildLadder(gradeKey: string): Ladder {
    const instance = INSTANCE_BY_GRADE_KEY.get(gradeKey);
    if (!instance) {
        throw new Error(`Unknown grade: ${gradeKey}`);
    }
    const { seed, year } = instance;
    const grade = gradeSummary(seed, year);
    const entrants = entrantsFor(seed, year);
    const random = randomFrom(hash(gradeKey));
    const played = (entrants.length - 1) * 2;

    const rows = entrants
        .map((club) => {
            const form = formIn(club, year) + (random() - 0.5) * 0.14;
            const won = Math.max(
                0,
                Math.min(
                    played,
                    Math.round(form * played + (random() - 0.5) * 2),
                ),
            );
            const drawn = random() < 0.12 ? 1 : 0;
            const lost = Math.max(0, played - won - drawn);
            const goalsFor = Math.round(played * (34 + form * 22));
            const goalsAgainst = Math.round(played * (34 + (1 - form) * 22));
            return {
                club,
                played,
                won,
                drawn,
                lost,
                goalsFor,
                goalsAgainst,
                percentage:
                    Math.round((goalsFor / goalsAgainst) * 100 * 100) / 100,
                points: won * 2 + drawn,
            };
        })
        .sort((a, b) => b.points - a.points || b.percentage - a.percentage);

    // Squad numbers only appear where a club fields more than one team in a grade.
    const ladderRows: LadderRow[] = rows.map((row, index) => ({
        position: index + 1,
        club: clubFor(row.club.key),
        displayName: clubFor(row.club.key).name,
        played: row.played,
        won: row.won,
        lost: row.lost,
        drawn: row.drawn,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        percentage: row.percentage,
        points: row.points,
    }));

    return { grade, rows: ladderRows };
}

const ladderCache = new Map<string, Ladder>();

export function getLadder(gradeKey: string): Ladder {
    const cached = ladderCache.get(gradeKey);
    if (cached) {
        return cached;
    }
    const ladder = buildLadder(gradeKey);
    ladderCache.set(gradeKey, ladder);
    return ladder;
}

interface Accumulator {
    points: number;
    teams: number;
    won: number;
    games: number;
    minorPremierships: number;
}

/**
 * A club's season score: for every grade it fields a team in, its ladder
 * position converted to points (first in a grade of ten earns ten), multiplied
 * by that grade's weight.
 */
function scoreSeason(year: number): Map<string, Accumulator> {
    const totals = new Map<string, Accumulator>();
    for (const seed of GRADE_SEEDS) {
        if (!seed.years.includes(year)) {
            continue;
        }
        const { rows } = getLadder(gradeKeyFor(seed, year));
        for (const row of rows) {
            const current = totals.get(row.club.key) ?? {
                points: 0,
                teams: 0,
                won: 0,
                games: 0,
                minorPremierships: 0,
            };
            current.points += (rows.length - row.position + 1) * seed.weight;
            current.teams += 1;
            current.won += row.won ?? 0;
            current.games += row.played ?? 0;
            if (row.position === 1) {
                current.minorPremierships += 1;
            }
            totals.set(row.club.key, current);
        }
    }
    return totals;
}

function rankSeason(
    year: number,
    previous: Map<string, number>,
): ChampionshipSeason {
    const totals = scoreSeason(year);
    const rows: ChampionshipRow[] = [...totals.entries()]
        .sort((a, b) => b[1].points - a[1].points)
        .map(([clubKey, totalsForClub], index) => ({
            rank: index + 1,
            club: clubFor(clubKey),
            points: Math.round(totalsForClub.points * 10) / 10,
            teams: totalsForClub.teams,
            winPercentage:
                totalsForClub.games > 0
                    ? Math.round(
                          (totalsForClub.won / totalsForClub.games) * 1000,
                      ) / 10
                    : null,
            minorPremierships: totalsForClub.minorPremierships,
            previousRank: previous.get(clubKey) ?? null,
        }));
    return { year, rows };
}

function buildChampionships(): ReadonlyMap<number, ChampionshipSeason> {
    const byYear = new Map<number, ChampionshipSeason>();
    let previous = new Map<string, number>();
    for (const year of RANKED_YEARS) {
        const season = rankSeason(year, previous);
        byYear.set(year, season);
        previous = new Map(season.rows.map((row) => [row.club.key, row.rank]));
    }
    return byYear;
}

const CHAMPIONSHIPS = buildChampionships();

export function getChampionship(year: number): ChampionshipSeason | null {
    return CHAMPIONSHIPS.get(year) ?? null;
}

/** Every ranked season, ascending. Feeds the rank-movement chart. */
export function getChampionshipHistory(): readonly ChampionshipSeason[] {
    return RANKED_YEARS.flatMap((year) => {
        const season = CHAMPIONSHIPS.get(year);
        return season ? [season] : [];
    });
}

export function getClub(clubKey: string): Club | null {
    return CLUB_BY_KEY.get(clubKey) ?? null;
}

/** Every grade finish for one club, most recent season first. */
export function getClubResults(clubKey: string): readonly ClubGradeResult[] {
    const results: ClubGradeResult[] = [];
    for (const year of [...YEARS].reverse()) {
        for (const seed of GRADE_SEEDS) {
            if (!seed.years.includes(year)) {
                continue;
            }
            const gradeKey = gradeKeyFor(seed, year);
            const { rows } = getLadder(gradeKey);
            const row = rows.find((entry) => entry.club.key === clubKey);
            if (!row) {
                continue;
            }
            results.push({
                year,
                gradeKey,
                gradeName: seed.name,
                competitionName: competitionFor(seed.competitionKey).shortName,
                ladderPosition: row.position,
                teamCount: rows.length,
                won: row.won,
                lost: row.lost,
                drawn: row.drawn,
                percentage: row.percentage,
            });
        }
    }
    return results;
}
