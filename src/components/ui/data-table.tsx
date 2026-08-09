// @tanstack/react-table is pinned to an exact version (not ^) in package.json:
// v9 removed useReactTable/getCoreRowModel's manual-mode API this component
// relies on, so a caret range would break on next install.
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
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
 * Presentational only. TanStack Table runs in manual mode — it supplies column
 * and header plumbing but never sorts or slices, because the client holds one
 * page and the server has already ordered it. Sorting client-side here would
 * silently reorder 50 rows out of 4000 and look correct while being wrong.
 */
export function DataTable<T>({
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
    const columnDefs = useMemo<ColumnDef<T>[]>(
        () =>
            columns.map((column) => ({
                id: column.id,
                header: column.header,
                cell: (context) => column.cell(context.row.original),
            })),
        [columns],
    );

    const table = useReactTable({
        data: rows as T[],
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
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
                                {row
                                    .getVisibleCells()
                                    .map((cell, cellIndex) => (
                                        <Td
                                            key={cell.id}
                                            align={columns[cellIndex].align}
                                            emphasis={
                                                columns[cellIndex].emphasis
                                            }
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </Td>
                                    ))}
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
                    <p className="text-[13px] text-ink-muted">
                        {`Page ${String(state.page)} of ${String(pages)} · ${String(totalRows)} rows`}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={state.page <= 1}
                            onClick={() => {
                                onChange({ ...state, page: state.page - 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink disabled:text-ink-muted"
                        >
                            {'Previous'}
                        </button>
                        <button
                            type="button"
                            disabled={state.page >= pages}
                            onClick={() => {
                                onChange({ ...state, page: state.page + 1 });
                            }}
                            className="rounded-card border border-rule px-3 py-1.5 text-sm text-ink disabled:text-ink-muted"
                        >
                            {'Next'}
                        </button>
                    </div>
                </nav>
            )}
        </>
    );
}
