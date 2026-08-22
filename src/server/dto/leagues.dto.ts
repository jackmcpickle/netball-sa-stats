import type { TableState } from '@/db/queries/pagination';
import type { ClubIndexEntry } from '@/server/dto/clubs.dto';
import type { ChampionshipSeason } from '@/server/dto/rankings.dto';
import type {
    Competition,
    Coverage,
    GradeSummary,
} from '@/server/dto/shared.dto';

export interface LeagueIndexEntry {
    readonly competition: Competition;
    readonly hasChampionship: boolean;
    readonly hasPlayHqOrg: boolean;
    readonly seasonCount: number;
    readonly latestYear: number | null;
}

export interface LeagueIndexPageDto {
    readonly leagues: readonly LeagueIndexEntry[];
}

export interface LeaguePageParams {
    readonly competitionKey: string;
    readonly season?: number;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

export interface LeaguePageDto {
    readonly competition: Competition;
    readonly hasChampionship: boolean;
    readonly hasPlayHqOrg: boolean;
    readonly coverage: Coverage;
    readonly clubs: readonly ClubIndexEntry[];
    readonly grades: readonly GradeSummary[];
    readonly season: ChampionshipSeason | null;
    readonly previousYear: number | null;
    readonly tableState: TableState | null;
    readonly totalRows: number;
}
