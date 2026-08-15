export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type TableState = {
    readonly sort: string;
    readonly desc: boolean;
    readonly page: number;
    readonly pageSize: number;
};

export type RawTableState = {
    readonly sort?: string;
    readonly dir?: string;
    readonly page?: number;
    readonly pageSize?: number;
};

export type TableSpec = {
    /** Column ids that may reach `orderBy`. Anything else falls back. */
    readonly sortable: readonly string[];
    readonly defaultSort: string;
    readonly defaultDesc: boolean;
};

/**
 * Pure arithmetic over a `TableState`/row count — kept here rather than in
 * `server/domain/table-query.ts` so presentation code (e.g. pagination
 * controls in `components/ui/data-table.tsx`) never has to import the
 * domain layer just to compute a page count or an offset. `TableQuery`
 * delegates to these.
 */
export function offsetFor(state: TableState): number {
    return (state.page - 1) * state.pageSize;
}

export function pageCount(totalRows: number, pageSize: number): number {
    return Math.max(1, Math.ceil(totalRows / pageSize));
}
