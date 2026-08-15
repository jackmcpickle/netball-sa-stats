/**
 * Raw season-row fetch, split out from `seasons.repo.ts` so that
 * `db/queries/coverage.ts` (which needs season rows to build the `Coverage`
 * DTO) and `seasons.repo.ts` (which needs `buildCoverage` from
 * `coverage.ts`) don't import each other and form a cycle.
 */
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { competitions, seasons } from '@/db/schema';
import type { SeasonRow } from '@/server/domain/coverage';

export type { SeasonRow };

export async function fetchSeasons(db: Db): Promise<readonly SeasonRow[]> {
    return await db
        .select({
            seasonId: seasons.id,
            seasonKey: seasons.seasonKey,
            startYear: seasons.startYear,
            isFinal: seasons.isFinal,
            source: seasons.source,
            competitionKey: competitions.key,
            competitionName: competitions.name,
        })
        .from(seasons)
        .innerJoin(competitions, eq(competitions.id, seasons.competitionId))
        .orderBy(asc(seasons.startYear), asc(competitions.id));
}
