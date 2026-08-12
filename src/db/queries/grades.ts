import type { TableSpec } from '@/db/queries/pagination';

export const LADDER_TABLE_SPEC: TableSpec = {
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
    defaultSort: 'position',
    defaultDesc: false,
} as const;
