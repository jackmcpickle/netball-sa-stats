/**
 * The published grade-weighting table. `fetchGradeWeights` used to live in
 * `src/db/queries/weights.ts`; that fetch logic now lives here. Read from D1
 * rather than from the seed module on purpose: the Method page must show the
 * weights that actually rank the clubs, including any edited by hand after
 * the seed ran.
 */
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { toCompetition } from '@/db/queries/coverage';
import { competitions, gradeWeights } from '@/db/schema';
import type { GradeWeightRow } from '@/server/dto/method.dto';

export async function fetchGradeWeights(
    db: Db,
): Promise<readonly GradeWeightRow[]> {
    const rows = await db
        .select({
            competitionKey: competitions.key,
            competitionName: competitions.name,
            division: gradeWeights.division,
            label: gradeWeights.label,
            tier: gradeWeights.tier,
            weight: gradeWeights.weight,
        })
        .from(gradeWeights)
        .innerJoin(
            competitions,
            eq(competitions.id, gradeWeights.competitionId),
        )
        .orderBy(asc(gradeWeights.tier), asc(gradeWeights.division));

    return rows.map((row) => ({
        competitionName: toCompetition(row.competitionKey, row.competitionName)
            .shortName,
        division: row.division,
        label: row.label,
        tier: row.tier,
        weight: row.weight,
    }));
}

export interface WeightsRepo {
    readonly all: () => Promise<readonly GradeWeightRow[]>;
}

export function createWeightsRepo(db: Db): WeightsRepo {
    return {
        async all(): Promise<readonly GradeWeightRow[]> {
            return await fetchGradeWeights(db);
        },
    };
}
