import type { TableState } from '@/db/queries/pagination';
import type { Club, Coverage } from '@/server/dto/shared.dto';

/** One club's line in one season's championship table. */
export interface ChampionshipRow {
    readonly rank: number;
    readonly club: Club;
    readonly points: number;
    readonly teams: number;
    /** Null when no grade in that season reported win/loss counts. */
    readonly winPercentage: number | null;
    /** Grade ladders topped — minor premierships, not finals flags. */
    readonly minorPremierships: number;
    /**
     * Null in the first covered season, where there is nothing to compare to
     * — and also whenever `ChampionshipSeason.coverageChanged` is true for
     * this row's season, since the previous season's field was structurally
     * different and a rank comparison would misrepresent movement.
     */
    readonly previousRank: number | null;
}

/** The rank-1 club on the unsorted championship table. */
export interface ChampionshipLeader {
    readonly club: Club;
    readonly points: number;
    readonly teams: number;
}

export interface ChampionshipSeason {
    readonly year: number;
    readonly rows: readonly ChampionshipRow[];
    /**
     * True when this season's set of competitions differs from the previous
     * ranked season's — e.g. Premier League and Reserves entering in 2023.
     * The UI must not draw a movement arrow across that boundary.
     */
    readonly coverageChanged: boolean;
}

/** One club's championship rank in one year, for the movement chart. */
export interface RankPoint {
    readonly year: number;
    readonly rank: number;
    readonly points: number;
}

export interface ClubRankSeries {
    readonly club: Club;
    readonly points: readonly RankPoint[];
}

export interface RankingsParams {
    readonly season?: number;
    readonly sort?: string;
    readonly dir?: 'asc' | 'desc';
    readonly page?: number;
    readonly pageSize?: number;
}

export interface RankingsPageDto {
    readonly clubCount: number;
    readonly coverage: Coverage;
    readonly gradeCount: number;
    readonly leader: ChampionshipLeader | null;
    readonly previousYear: number | null;
    readonly season: ChampionshipSeason;
    readonly series: readonly ClubRankSeries[];
    readonly tableState: TableState;
    readonly totalRows: number;
    readonly worstRank: number;
}
