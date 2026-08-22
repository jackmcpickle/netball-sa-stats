/**
 * Fetches every season row (joined to its competition) and hands it to the
 * `Coverage` domain object. No business logic here — `Coverage` decides what
 * years count as covered/ranked.
 */
import { isUndefined } from 'es-toolkit';
import type { Db } from '@/db';
import { buildCoverage, IS_SAMPLE_DATA } from '@/db/queries/coverage';
import { fetchSeasons } from '@/db/queries/seasons';
import type { SeasonRow } from '@/db/queries/seasons';
import { championshipCompetitionKeys } from '@/pipeline/seed/catalogue';
import { Coverage } from '@/server/domain/coverage';
import type { Coverage as CoverageDto } from '@/server/dto/shared.dto';

function filterSeasons(
    rows: readonly SeasonRow[],
    competitionKey?: string,
    championshipOnly = false,
): readonly SeasonRow[] {
    const championshipKeys = championshipCompetitionKeys();
    return rows.filter((row) => {
        if (!isUndefined(competitionKey)) {
            return row.competitionKey === competitionKey;
        }
        return !championshipOnly || championshipKeys.has(row.competitionKey);
    });
}

export interface SeasonsRepo {
    readonly coverage: (options?: {
        readonly competitionKey?: string;
        readonly championshipOnly?: boolean;
    }) => Promise<Coverage>;
    readonly fullCoverage: (options?: {
        readonly competitionKey?: string;
        readonly championshipOnly?: boolean;
    }) => Promise<CoverageDto>;
}

export function createSeasonsRepo(db: Db): SeasonsRepo {
    return {
        async coverage(options?: {
            readonly competitionKey?: string;
            readonly championshipOnly?: boolean;
        }): Promise<Coverage> {
            return Coverage.from(
                filterSeasons(
                    await fetchSeasons(db),
                    options?.competitionKey,
                    options?.championshipOnly === true,
                ),
            );
        },
        async fullCoverage(options?: {
            readonly competitionKey?: string;
            readonly championshipOnly?: boolean;
        }): Promise<CoverageDto> {
            return buildCoverage(
                filterSeasons(
                    await fetchSeasons(db),
                    options?.competitionKey,
                    options?.championshipOnly === true,
                ),
                IS_SAMPLE_DATA,
            );
        },
    };
}
