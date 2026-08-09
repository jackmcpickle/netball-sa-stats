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
 * Search params are attacker-controlled, so the sort column is matched
 * against a per-table allow-list rather than sanitised. All three tables
 * fetch every row and sort/paginate in JS (see `applyTableState`) — the
 * allow-list buys no DB-level savings, it just stops an unknown column id
 * (or a hostile string) from reaching the in-memory comparators.
 * Everything unrecognised silently falls back — a hostile URL gets the
 * default view, not a 500.
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

/**
 * Resolves table state, sorts, and slices in one place — the single spot the
 * page-clamp can be wrong. `resolveTableState` alone has no `totalRows`, so
 * it can floor an out-of-range page at 1 but never clamp it to the last
 * page; this wrapper has the row count and does that clamp before slicing,
 * so `?page=999` on a 3-page table lands on page 3, not an empty page.
 */
export function applyTableState<T>(
    rows: readonly T[],
    raw: RawTableState,
    spec: TableSpec,
    sortFn: (rows: readonly T[], state: TableState) => readonly T[],
): {
    readonly rows: readonly T[];
    readonly totalRows: number;
    readonly tableState: TableState;
} {
    const totalRows = rows.length;
    const resolved = resolveTableState(raw, spec);
    const page = Math.min(
        resolved.page,
        pageCount(totalRows, resolved.pageSize),
    );
    const tableState: TableState = { ...resolved, page };
    const sorted = sortFn(rows, tableState);
    const offset = offsetFor(tableState);
    return {
        rows: sorted.slice(offset, offset + tableState.pageSize),
        totalRows,
        tableState,
    };
}
