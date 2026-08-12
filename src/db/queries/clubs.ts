import type { TableSpec } from '@/db/queries/pagination';

// Only ids with a clickable header in ClubResultsTable belong here: 'played',
// 'lost', and 'points' have comparators but no column of their own (the W-L-D
// record is one combined column, sortable via 'won').
export const CLUB_RESULTS_TABLE_SPEC: TableSpec = {
    sortable: ['year', 'grade', 'position', 'won'],
    defaultSort: 'year',
    defaultDesc: true,
} as const;
