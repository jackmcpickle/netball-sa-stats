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
 * What a repo needs in order to fetch one page in SQL, and nothing more.
 * `sort` has already been matched against the table's allow-list, so a repo
 * may map it to a column without re-validating; it is never the raw URL
 * value. `offset` is already clamped to the last page.
 */
export interface PageRequest {
    readonly sort: string;
    readonly desc: boolean;
    readonly limit: number;
    readonly offset: number;
}

export interface PagedResult<T> {
    readonly rows: readonly T[];
    readonly totalRows: number;
    readonly state: TableState;
}

/**
 * Search params are attacker-controlled, so the sort column is matched
 * against a per-table allow-list rather than sanitised. The allow-list is
 * what lets a repo interpolate the column into `orderBy` — and what stops an
 * unknown column id (or a hostile string) from reaching either SQL or the
 * in-memory comparators. Everything unrecognised silently falls back: a
 * hostile URL gets the default view, not a 500.
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
    ): PagedResult<T> {
        const totalRows = rows.length;
        const clamped = this.clampedTo(totalRows);
        const sorted = sort(rows, clamped);
        const offset = offsetFor(clamped.state);
        return {
            rows: sorted.slice(offset, offset + clamped.state.pageSize),
            totalRows,
            state: clamped.state,
        };
    }

    /**
     * The SQL counterpart of `apply`, and the reason it exists as a method
     * rather than as two calls at each call site: the clamp needs a row
     * count, and a repo fetching one page does not have one. Counting first
     * and only then fetching is enforced here, once, instead of being a rule
     * five services have to remember.
     */
    public async page<T>(
        countRows: () => Promise<number>,
        fetchRows: (request: PageRequest) => Promise<readonly T[]>,
    ): Promise<PagedResult<T>> {
        const totalRows = await countRows();
        const clamped = this.clampedTo(totalRows);
        return {
            rows: await fetchRows(clamped.request()),
            totalRows,
            state: clamped.state,
        };
    }

    /** The slice this query asks for, ready to hand to a repo. */
    public request(): PageRequest {
        return {
            sort: this.state.sort,
            desc: this.state.desc,
            limit: this.state.pageSize,
            offset: offsetFor(this.state),
        };
    }

    /**
     * `from` alone can floor an out-of-range page at 1 but never clamp it to
     * the last page, because it has no row count. This does, so `?page=999`
     * on a 3-page table lands on page 3 rather than an empty page.
     */
    private clampedTo(totalRows: number): TableQuery {
        return new TableQuery({
            ...this.state,
            page: Math.min(
                this.state.page,
                pageCount(totalRows, this.state.pageSize),
            ),
        });
    }
}
