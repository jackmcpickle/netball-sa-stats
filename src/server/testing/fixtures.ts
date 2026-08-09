/**
 * Seeds a nested competition → season → grade → result graph into a test db
 * created by `createTestDb()`, defaulting the fields real imports always set
 * but that are noise in a test spec. Returns the row ids keyed by the spec's
 * natural keys so tests can assert against them without re-querying.
 */
import type { Db } from '@/db';
import {
    clubs,
    competitions,
    gradeWeights,
    grades,
    seasons,
    teams,
    teamSeasonResults,
} from '@/db/schema';

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

/** Inserts (or reuses) a club by key and records its id, returning the id. */
async function seedClub(
    db: Db,
    result: SeedResult,
    resultSpec: ResultSpec,
): Promise<number> {
    const existing = result.clubs.get(resultSpec.clubKey);
    if (existing !== undefined) {
        return existing;
    }
    const [clubRow] = await db
        .insert(clubs)
        .values({ clubKey: resultSpec.clubKey, name: resultSpec.clubName })
        .onConflictDoUpdate({
            target: clubs.clubKey,
            set: { name: resultSpec.clubName },
        })
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
            gradeId,
            displayName: resultSpec.displayName,
        })
        .returning();
    const teamKey = `${gradeSpec.gradeKey}:${resultSpec.clubKey}`;
    result.teams.set(teamKey, teamRow.id);

    const [resultRow] = await db
        .insert(teamSeasonResults)
        .values({
            teamId: teamRow.id,
            gradeId,
            ladderPosition: resultSpec.ladderPosition,
            played: resultSpec.played,
            won: resultSpec.won,
            drawn: resultSpec.drawn,
            lost: resultSpec.lost,
            byes: resultSpec.byes,
            goalsFor: resultSpec.goalsFor,
            goalsAgainst: resultSpec.goalsAgainst,
            goalDifference: resultSpec.goalDifference,
            points: resultSpec.points,
            percentage: resultSpec.percentage,
            source: 'playhq',
            placementBasis: 'regular_season_ladder',
        })
        .returning();
    result.results.set(teamKey, resultRow.id);
}

/** Inserts a grade, its grade_weights row (once per tier/division), and its results. */
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
            seasonId,
            gradeKey: gradeSpec.gradeKey,
            name: gradeSpec.name,
            tier: gradeSpec.tier,
            division: gradeSpec.division ?? null,
            teamCount: gradeSpec.teamCount,
            ageBand: gradeSpec.ageBand,
        })
        .onConflictDoUpdate({
            target: grades.gradeKey,
            set: {
                name: gradeSpec.name,
                tier: gradeSpec.tier,
                division: gradeSpec.division ?? null,
                teamCount: gradeSpec.teamCount,
            },
        })
        .returning();
    result.grades.set(gradeSpec.gradeKey, gradeRow.id);

    const weightKey = `${gradeSpec.tier}:${gradeSpec.division ?? ''}`;
    if (!weightedTiers.has(weightKey)) {
        weightedTiers.add(weightKey);
        await db
            .insert(gradeWeights)
            .values({
                competitionId,
                tier: gradeSpec.tier,
                division: gradeSpec.division ?? null,
                label: gradeSpec.name,
                weight: 1,
            })
            .onConflictDoUpdate({
                target: [
                    gradeWeights.competitionId,
                    gradeWeights.tier,
                    gradeWeights.division,
                ],
                set: { weight: 1, label: gradeSpec.name },
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
    seasonSpec: SeasonSpec,
): Promise<void> {
    const [seasonRow] = await db
        .insert(seasons)
        .values({
            competitionId,
            seasonKey: seasonSpec.seasonKey,
            competitionPeriod: seasonSpec.competitionPeriod ?? 'winter',
            label: seasonSpec.label ?? String(seasonSpec.startYear),
            startYear: seasonSpec.startYear,
            endYear: seasonSpec.endYear ?? seasonSpec.startYear,
            isFinal: seasonSpec.isFinal,
            source: 'playhq',
        })
        .onConflictDoUpdate({
            target: seasons.seasonKey,
            set: {
                startYear: seasonSpec.startYear,
                endYear: seasonSpec.endYear ?? seasonSpec.startYear,
                isFinal: seasonSpec.isFinal,
            },
        })
        .returning();
    result.seasons.set(seasonSpec.seasonKey, seasonRow.id);

    const weightedTiers = new Set<string>();
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
    competitionSpec: CompetitionSpec,
): Promise<void> {
    const [competitionRow] = await db
        .insert(competitions)
        .values({ key: competitionSpec.key, name: competitionSpec.name })
        .onConflictDoUpdate({
            target: competitions.key,
            set: { name: competitionSpec.name },
        })
        .returning();
    result.competitions.set(competitionSpec.key, competitionRow.id);

    for (const seasonSpec of competitionSpec.seasons) {
        // eslint-disable-next-line no-await-in-loop -- each season depends on the competition row just created above
        await seedSeason(db, result, competitionRow.id, seasonSpec);
    }
}

export async function seed(db: Db, spec: SeedSpec): Promise<SeedResult> {
    const result: SeedResult = {
        competitions: new Map(),
        seasons: new Map(),
        grades: new Map(),
        clubs: new Map(),
        teams: new Map(),
        results: new Map(),
    };

    for (const competitionSpec of spec.competitions) {
        // eslint-disable-next-line no-await-in-loop -- id maps must be populated in spec order for later lookups
        await seedCompetition(db, result, competitionSpec);
    }

    return result;
}
