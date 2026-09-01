import {
    rowPaginationFeature,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type ColumnDef,
    type RowData,
} from '@tanstack/react-table';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import {
    Table,
    TableFrame,
    Td,
    Th,
    Tr,
    type Align,
} from '@/components/ui/table';
import { pageCount, type TableState } from '@/db/queries/pagination';

export interface DataTableColumn<T> {
    readonly id: string;
    readonly header: string;
    readonly align?: Align;
    readonly sortable?: boolean;
    readonly emphasis?: 'normal' | 'strong' | 'quiet';
    readonly cell: (row: T) => ReactNode;
}

/**
 * Sorting and pagination state live on the server, so the two features are
 * registered for their state and APIs but no `sortedRowModel` or
 * `paginatedRowModel` slot is. Adding either would reorder or slice the 50
 * rows of the current page as if they were the whole 4000-row result, which
 * looks right on screen and is wrong.
 */
const FEATURES = tableFeatures({ rowPaginationFeature, rowSortingFeature });

export function DataTable<T extends RowData>({
    caption,
    columns,
    rows,
    rowKey,
    totalRows,
    state,
    onChange,
    highlightRow,
}: {
    readonly caption: string;
    readonly columns: readonly DataTableColumn<T>[];
    readonly rows: readonly T[];
    readonly rowKey: (row: T) => string;
    readonly totalRows: number;
    readonly state: TableState;
    readonly onChange: (next: TableState) => void;
    readonly highlightRow?: (row: T) => boolean;
}): JSX.Element {
    const columnDefs = useMemo<ColumnDef<typeof FEATURES, T>[]>(
        () =>
            columns.map((column) => ({
                id: column.id,
                header: column.header,
                cell: (context) => column.cell(context.row.original),
            })),
        [columns],
    );

    const columnById = useMemo(
        () => new Map(columns.map((column) => [column.id, column])),
        [columns],
    );

    const table = useTable({
        columns: columnDefs,
        data: rows as T[],
        features: FEATURES,
        manualPagination: true,
        manualSorting: true,
        rowCount: totalRows,
    });

    const onSort = useCallback(
        (id: string) => {
            // Re-clicking the active column flips direction; a new column starts
            // descending and resets to page 1, because page 4 of the old sort
            // is meaningless under the new one.
            onChange(
                id === state.sort
                    ? { ...state, desc: !state.desc, page: 1 }
                    : { ...state, sort: id, desc: true, page: 1 },
            );
        },
        [onChange, state],
    );

    const pages = pageCount(totalRows, state.pageSize);
    const showPagination = totalRows > state.pageSize;

    return (
        <>
            <TableFrame>
                <Table caption={caption}>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <Th
                                    key={column.id}
                                    align={column.align}
                                    ariaSort={
                                        column.sortable === true &&
                                        column.id === state.sort
                                            ? state.desc
                                                ? 'descending'
                                                : 'ascending'
                                            : 'none'
                                    }
                                >
                                    {column.sortable === true ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSort(column.id);
                                            }}
                                            className="label-mono inline-flex items-center gap-1 text-ink-muted hover:text-ink"
                                        >
                                            {column.header}
                                            <span aria-hidden="true">
                                                {column.id === state.sort
                                                    ? state.desc
                                                        ? '↓'
                                                        : '↑'
                                                    : '↕'}
                                            </span>
                                        </button>
                                    ) : (
                                        column.header
                                    )}
                                </Th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, index) => (
                            <Tr
                                key={rowKey(row.original)}
                                index={index}
                                highlight={
                                    highlightRow?.(row.original) ?? false
                                }
                            >
                                {/* `getVisibleCells` belongs to
                                columnVisibilityFeature, which is not
                                registered; every column always renders. */}
                                {row.getAllCells().map((cell) => {
                                    const column = columnById.get(
                                        cell.column.id,
                                    );
                                    return (
                                        <Td
                                            key={cell.id}
                                            align={column?.align}
                                            emphasis={column?.emphasis}
                                        >
                                            <table.FlexRender cell={cell} />
                                        </Td>
                                    );
                                })}
                            </Tr>
                        ))}
                    </tbody>
                </Table>
            </TableFrame>
            {showPagination && (
                <nav
                    aria-label="Pagination"
                    className="mt-4 flex items-center justify-between gap-4"
                >
                    <p
                        aria-live="polite"
                        className="text-[13px] text-ink-muted"
                    >
                        {`Page ${String(state.page)} of ${String(pages)} · ${String(totalRows)} rows`}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            aria-disabled={state.page <= 1}
                            onClick={() => {
                                if (state.page <= 1) {
                                    return;
                                }
                                onChange({ ...state, page: state.page - 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink aria-disabled:text-ink-muted"
                        >
                            {'Previous'}
                        </button>
                        <button
                            type="button"
                            aria-disabled={state.page >= pages}
                            onClick={() => {
                                if (state.page >= pages) {
                                    return;
                                }
                                onChange({ ...state, page: state.page + 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink aria-disabled:text-ink-muted"
                        >
                            {'Next'}
                        </button>
                    </div>
                </nav>
            )}
        </>
    );
}
