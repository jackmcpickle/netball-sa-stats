/**
 * Seeds a nested competition → season → grade → result graph into a test db
 * created by `createTestDb()`, defaulting the fields real imports always set
 * but that are noise in a test spec. Returns the row ids keyed by the spec's
 * natural keys so tests can assert against them without re-querying.
 */
import { isNull, isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import {
    clubs,
    competitions,
    gradeWeights,
    grades,
    games,
    seasons,
    teams,
    teamSeasonResults,
} from '@/db/schema';
import type { GameStatus } from '@/db/schema';

export interface ResultSpec {
    clubKey: string;
    clubName: string;
    displayName: string;
    ladderPosition: number;
    played?: number;
    won?: number;
    drawn?: number;
    lost?: number;
    byes?: number;
    goalsFor?: number;
    goalsAgainst?: number;
    goalDifference?: number;
    points?: number;
    percentage?: number;
}

export interface GradeSpec {
    gradeKey: string;
    name: string;
    tier: number;
    division?: number;
    teamCount: number;
    ageBand?: string;
    results: ResultSpec[];
}

export interface SeasonSpec {
    seasonKey: string;
    startYear: number;
    endYear?: number;
    isFinal: boolean;
    label?: string;
    competitionPeriod?: 'winter' | 'summer' | 'annual';
    grades: GradeSpec[];
}

export interface CompetitionSpec {
    key: string;
    name: string;
    seasons: SeasonSpec[];
}

export interface SeedSpec {
    competitions: CompetitionSpec[];
}

export interface SeedResult {
    competitions: Map<string, number>;
    seasons: Map<string, number>;
    grades: Map<string, number>;
    clubs: Map<string, number>;
    teams: Map<string, number>;
    results: Map<string, number>;
}

/**
 * Inserts (or reuses, within a single seed() call) a club by key and
 * records its id, returning the id. Reuse is scoped to the in-memory
 * `result.clubs` map built during this call, not a database-level upsert:
 * a genuine duplicate clubKey across two seed() calls hits the unique
 * index and rejects, rather than silently merging.
 */
async function seedClub(
    db: Db,
    result: SeedResult,
    resultSpec: ResultSpec,
): Promise<number> {
    const existing = result.clubs.get(resultSpec.clubKey);
    if (!isUndefined(existing)) {
        return existing;
    }
    const [clubRow] = await db
        .insert(clubs)
        .values({ clubKey: resultSpec.clubKey, name: resultSpec.clubName })
        .returning();
    result.clubs.set(resultSpec.clubKey, clubRow.id);
    return clubRow.id;
}

/** Inserts a team + its team_season_results row for one grade result. */
async function seedTeamResult(
    db: Db,
    result: SeedResult,
    gradeSpec: GradeSpec,
    gradeId: number,
    resultSpec: ResultSpec,
): Promise<void> {
    const clubId = await seedClub(db, result, resultSpec);

    const [teamRow] = await db
        .insert(teams)
        .values({
            clubId,
            displayName: resultSpec.displayName,
            gradeId,
        })
        .returning();
    const teamKey = `${gradeSpec.gradeKey}:${resultSpec.clubKey}`;
    result.teams.set(teamKey, teamRow.id);

    const [resultRow] = await db
        .insert(teamSeasonResults)
        .values({
            byes: resultSpec.byes,
            drawn: resultSpec.drawn,
            goalDifference: resultSpec.goalDifference,
            goalsAgainst: resultSpec.goalsAgainst,
            goalsFor: resultSpec.goalsFor,
            gradeId,
            ladderPosition: resultSpec.ladderPosition,
            lost: resultSpec.lost,
            percentage: resultSpec.percentage,
            placementBasis: 'regular_season_ladder',
            played: resultSpec.played,
            points: resultSpec.points,
            source: 'playhq',
            teamId: teamRow.id,
            won: resultSpec.won,
        })
        .returning();
    result.results.set(teamKey, resultRow.id);
}

/** Inserts a grade, its grade_weights row (once per competition/tier/division), and its results. */
async function seedGrade(
    db: Db,
    result: SeedResult,
    competitionId: number,
    seasonId: number,
    weightedTiers: Set<string>,
    gradeSpec: GradeSpec,
): Promise<void> {
    const [gradeRow] = await db
        .insert(grades)
        .values({
            ageBand: gradeSpec.ageBand,
            division: gradeSpec.division ?? null,
            gradeKey: gradeSpec.gradeKey,
            name: gradeSpec.name,
            seasonId,
            teamCount: gradeSpec.teamCount,
            tier: gradeSpec.tier,
        })
        .returning();
    result.grades.set(gradeSpec.gradeKey, gradeRow.id);

    const weightKey = `${competitionId}:${gradeSpec.tier}:${gradeSpec.division ?? ''}`;
    if (!weightedTiers.has(weightKey)) {
        weightedTiers.add(weightKey);
        await db.insert(gradeWeights).values({
            competitionId,
            division: gradeSpec.division ?? null,
            label: gradeSpec.name,
            tier: gradeSpec.tier,
            weight: 1,
        });
    }

    for (const resultSpec of gradeSpec.results) {
        // eslint-disable-next-line no-await-in-loop -- each result insert depends on the team/club rows just created above
        await seedTeamResult(db, result, gradeSpec, gradeRow.id, resultSpec);
    }
}

/** Inserts a season and all of its grades. */
async function seedSeason(
    db: Db,
    result: SeedResult,
    competitionId: number,
    weightedTiers: Set<string>,
    seasonSpec: SeasonSpec,
): Promise<void> {
    const [seasonRow] = await db
        .insert(seasons)
        .values({
            competitionId,
            competitionPeriod: seasonSpec.competitionPeriod ?? 'winter',
            endYear: seasonSpec.endYear ?? seasonSpec.startYear,
            isFinal: seasonSpec.isFinal,
            label: seasonSpec.label ?? String(seasonSpec.startYear),
            seasonKey: seasonSpec.seasonKey,
            source: 'playhq',
            startYear: seasonSpec.startYear,
        })
        .returning();
    result.seasons.set(seasonSpec.seasonKey, seasonRow.id);

    for (const gradeSpec of seasonSpec.grades) {
        // eslint-disable-next-line no-await-in-loop -- each grade depends on the season row just created above
        await seedGrade(
            db,
            result,
            competitionId,
            seasonRow.id,
            weightedTiers,
            gradeSpec,
        );
    }
}

/** Inserts a competition and all of its seasons. */
async function seedCompetition(
    db: Db,
    result: SeedResult,
    weightedTiers: Set<string>,
    competitionSpec: CompetitionSpec,
): Promise<void> {
    const [competitionRow] = await db
        .insert(competitions)
        .values({ key: competitionSpec.key, name: competitionSpec.name })
        .returning();
    result.competitions.set(competitionSpec.key, competitionRow.id);

    for (const seasonSpec of competitionSpec.seasons) {
        // eslint-disable-next-line no-await-in-loop -- each season depends on the competition row just created above
        await seedSeason(
            db,
            result,
            competitionRow.id,
            weightedTiers,
            seasonSpec,
        );
    }
}

export async function seed(db: Db, spec: SeedSpec): Promise<SeedResult> {
    const result: SeedResult = {
        clubs: new Map(),
        competitions: new Map(),
        grades: new Map(),
        results: new Map(),
        seasons: new Map(),
        teams: new Map(),
    };

    // Tracks (competitionId, tier, division) combos that already have a
    // `grade_weights` row, across the whole seed() call. SQLite's unique
    // index on (competitionId, tier, division) treats two NULL divisions as
    // distinct, so without this de-dup, seeding two same-tier seasons under
    // one competition would silently insert duplicate weight rows and fan
    // out any join against `grade_weights` (e.g. in `fetchResults`).
    const weightedTiers = new Set<string>();
    for (const competitionSpec of spec.competitions) {
        // eslint-disable-next-line no-await-in-loop -- id maps must be populated in spec order for later lookups
        await seedCompetition(db, result, weightedTiers, competitionSpec);
    }

    return result;
}

export interface GameSpec {
    /** `gradeKey` from the seed spec; the game hangs off that grade. */
    gradeKey: string;
    /** Club keys. Null is a real shape — a bye, or an undecided finalist. */
    home: string | null;
    away: string | null;
    round?: number;
    roundName?: string;
    isFinals?: boolean;
    playedAt?: number;
    homeScore?: number | null;
    awayScore?: number | null;
    status?: GameStatus;
}

function teamIdFor(
    result: SeedResult,
    gradeKey: string,
    club: string | null,
): number | null {
    return isNull(club)
        ? null
        : (result.teams.get(`${gradeKey}:${club}`) ?? null);
}

/**
 * Adds fixtures on top of an existing `seed()` graph. Separate from `seed()`
 * because games reference teams by (grade, club), so the team rows must
 * already exist — and most tests want ladders without fixtures.
 */
export async function seedGames(
    db: Db,
    result: SeedResult,
    specs: readonly GameSpec[],
): Promise<void> {
    if (specs.length === 0) {
        return;
    }
    await db.insert(games).values(
        specs.map((spec, index) => {
            const gradeId = result.grades.get(spec.gradeKey);
            if (isUndefined(gradeId)) {
                throw new Error(`seedGames: unknown grade ${spec.gradeKey}`);
            }
            return {
                awayScore: spec.awayScore ?? null,
                awayTeamId: teamIdFor(result, spec.gradeKey, spec.away),
                gradeId,
                homeScore: spec.homeScore ?? null,
                homeTeamId: teamIdFor(result, spec.gradeKey, spec.home),
                isFinals: spec.isFinals ?? false,
                playedAt: spec.playedAt ?? null,
                playhqId: `game-${spec.gradeKey}-${String(index)}`,
                round: spec.round ?? 1,
                roundName: spec.roundName ?? `Round ${String(spec.round ?? 1)}`,
                source: 'playhq' as const,
                status: spec.status ?? 'final',
            };
        }),
    );
}
