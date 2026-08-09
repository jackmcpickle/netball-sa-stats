export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface TableState {
    readonly sort: string;
    readonly desc: boolean;
    readonly page: number;
    readonly pageSize: number;
}

export interface RawTableState {
    readonly sort?: string;
    readonly dir?: string;
    readonly page?: number;
    readonly pageSize?: number;
}

export interface TableSpec {
    /** Column ids that may reach `orderBy`. Anything else falls back. */
    readonly sortable: readonly string[];
    readonly defaultSort: string;
    readonly defaultDesc: boolean;
}

/**
 * Search params are attacker-controlled and the sort column reaches drizzle's
 * `orderBy`, so it is matched against an allow-list rather than sanitised.
 * Everything unrecognised silently falls back — a hostile URL gets the default
 * view, not a 500.
 */
export function resolveTableState(
    raw: RawTableState,
    spec: TableSpec,
): TableState {
    const sort =
        raw.sort !== undefined && spec.sortable.includes(raw.sort)
            ? raw.sort
            : spec.defaultSort;
    const desc =
        raw.dir === 'asc'
            ? false
            : raw.dir === 'desc'
              ? true
              : spec.defaultDesc;
    const page =
        raw.page !== undefined && Number.isInteger(raw.page) && raw.page > 0
            ? raw.page
            : 1;
    const pageSize =
        PAGE_SIZES.find((size) => size === raw.pageSize) ?? DEFAULT_PAGE_SIZE;
    return { sort, desc, page, pageSize };
}

export function offsetFor(state: TableState): number {
    return (state.page - 1) * state.pageSize;
}

export function pageCount(totalRows: number, pageSize: number): number {
    return Math.max(1, Math.ceil(totalRows / pageSize));
}
