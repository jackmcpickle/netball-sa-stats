/**
 * The domain object for "sort, page, and slice a table". `resolveTableState`,
 * `applyTableState`, `offsetFor`, and `pageCount` used to live as free
 * functions in `src/db/queries/pagination.ts`; that logic now lives here.
 * The types (`TableState`, `RawTableState`, `TableSpec`) and the
 * `PAGE_SIZES`/`DEFAULT_PAGE_SIZE` constants stay in `pagination.ts` — they
 * are shape, not behaviour, and loaders still reference `TableState`.
 */
import {
    DEFAULT_PAGE_SIZE,
    offsetFor,
    PAGE_SIZES,
    pageCount,
    type RawTableState,
    type TableSpec,
    type TableState,
} from '@/db/queries/pagination';

/**
 * Search params are attacker-controlled, so the sort column is matched
 * against a per-table allow-list rather than sanitised. All three tables
 * fetch every row and sort/paginate in JS (see `TableQuery.apply`) — the
 * allow-list buys no DB-level savings, it just stops an unknown column id
 * (or a hostile string) from reaching the in-memory comparators.
 * Everything unrecognised silently falls back — a hostile URL gets the
 * default view, not a 500.
 */
function resolveTableState(raw: RawTableState, spec: TableSpec): TableState {
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

export class TableQuery {
    public readonly state: TableState;

    private constructor(state: TableState) {
        this.state = state;
    }

    public static from(raw: RawTableState, spec: TableSpec): TableQuery {
        return new TableQuery(resolveTableState(raw, spec));
    }

    /**
     * Resolves table state, sorts, and slices in one place — the single spot
     * the page-clamp can be wrong. `from` alone has no `totalRows`, so it can
     * floor an out-of-range page at 1 but never clamp it to the last page;
     * this method has the row count and does that clamp before slicing, so
     * `?page=999` on a 3-page table lands on page 3, not an empty page.
     */
    public apply<T>(
        rows: readonly T[],
        sort: (rows: readonly T[], q: TableQuery) => readonly T[],
    ): {
        readonly rows: readonly T[];
        readonly totalRows: number;
        readonly state: TableState;
    } {
        const totalRows = rows.length;
        const page = Math.min(
            this.state.page,
            pageCount(totalRows, this.state.pageSize),
        );
        const clamped = new TableQuery({ ...this.state, page });
        const sorted = sort(rows, clamped);
        const offset = offsetFor(clamped.state);
        return {
            rows: sorted.slice(offset, offset + clamped.state.pageSize),
            totalRows,
            state: clamped.state,
        };
    }
}
