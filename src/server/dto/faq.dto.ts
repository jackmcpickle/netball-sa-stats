import type { ChampionshipLeader } from '@/server/dto/rankings.dto';
import type { Coverage } from '@/server/dto/shared.dto';

export interface FaqPageDto {
    readonly coverage: Coverage;
    readonly fixtureFromYear: number | null;
    readonly latestRankedYear: number | null;
    readonly leader: ChampionshipLeader | null;
}
