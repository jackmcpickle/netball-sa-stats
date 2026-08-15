import type { TableSpec } from '@/db/queries/pagination';

export const LADDER_TABLE_SPEC: TableSpec = {
    defaultDesc: false,
    defaultSort: 'position',
    sortable: [
        'position',
        'team',
        'played',
        'won',
        'lost',
        'drawn',
        'goalsFor',
        'goalsAgainst',
        'percentage',
        'points',
    ],
} as const;
