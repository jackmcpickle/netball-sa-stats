/**
 * Fetches every season row (joined to its competition) and hands it to the
 * `Coverage` domain object. No business logic here — `Coverage` decides what
 * years count as covered/ranked.
 */
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { competitions, seasons } from '@/db/schema';
import { Coverage } from '@/server/domain/coverage';
import type { SeasonRow } from '@/server/domain/coverage';

export type { SeasonRow };

export async function fetchSeasons(db: Db): Promise<readonly SeasonRow[]> {
    return db
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

export function createSeasonsRepo(db: Db): { coverage(): Promise<Coverage> } {
    return {
        async coverage(): Promise<Coverage> {
            return Coverage.from(await fetchSeasons(db));
        },
    };
}
