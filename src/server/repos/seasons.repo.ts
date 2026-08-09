/**
 * Fetches every season row (joined to its competition) and hands it to the
 * `Coverage` domain object. No business logic here — `Coverage` decides what
 * years count as covered/ranked.
 */
import type { Db } from '@/db';
import { buildCoverage, IS_SAMPLE_DATA } from '@/db/queries/coverage';
import { fetchSeasons } from '@/db/queries/seasons';
import { Coverage } from '@/server/domain/coverage';
import type { SeasonRow } from '@/server/domain/coverage';
import type { Coverage as CoverageDto } from '@/server/dto/shared.dto';

export type { SeasonRow };
export { fetchSeasons };

export function createSeasonsRepo(db: Db): {
    coverage(): Promise<Coverage>;
    fullCoverage(): Promise<CoverageDto>;
} {
    return {
        async coverage(): Promise<Coverage> {
            return Coverage.from(await fetchSeasons(db));
        },
        async fullCoverage(): Promise<CoverageDto> {
            return buildCoverage(await fetchSeasons(db), IS_SAMPLE_DATA);
        },
    };
}
