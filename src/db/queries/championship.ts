import type { TableSpec } from '@/db/queries/pagination';

export const CHAMPIONSHIP_TABLE_SPEC: TableSpec = {
    defaultDesc: false,
    defaultSort: 'rank',
    sortable: ['rank', 'club', 'points', 'teams'],
} as const;
