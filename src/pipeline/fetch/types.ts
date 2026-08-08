/** Shapes of the three PlayHQ GraphQL responses used by the fetch pipeline. */
import type { LadderPool } from '@/pipeline/fetch/ladder';

export type DiscoverCompetitionsResponse = {
    data: {
        discoverCompetitions: readonly {
            id: string;
            name: string;
            seasons: readonly {
                id: string;
                name: string;
                startDate: string;
                endDate: string;
                status: { name: string; value: string };
            }[];
            organisation: { id: string; name: string };
        }[];
    };
};

export type GradeListDiscoverSeasonResponse = {
    data: {
        discoverSeason: {
            id: string;
            name: string;
            competition: {
                id: string;
                name: string;
                type: string;
                organisation: { id: string; name: string };
            };
            status: { name: string; value: string };
            grades: readonly {
                id: string;
                name: string;
                day: { name: string; value: string } | null;
                gender: { name: string; value: string } | null;
                age: { name: string; value: string } | null;
            }[];
        } | null;
    };
};

export type GradeLadderResponse = {
    data: {
        discoverGrade: {
            id: string;
            name: string;
            ladderType: string;
            ladder: readonly LadderPool[];
        } | null;
    };
};
