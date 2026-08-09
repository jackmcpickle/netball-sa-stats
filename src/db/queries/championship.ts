import type { TableSpec } from '@/db/queries/pagination';

export const CHAMPIONSHIP_TABLE_SPEC: TableSpec = {
    sortable: ['rank', 'club', 'points', 'teams'],
    defaultSort: 'rank',
    defaultDesc: false,
} as const;
