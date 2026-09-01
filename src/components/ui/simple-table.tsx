import type { JSX, ReactNode } from 'react';
import {
    Table,
    TableFrame,
    Td,
    Th,
    Tr,
    type Align,
} from '@/components/ui/table';

export interface SimpleTableColumn<T> {
    readonly id: string;
    readonly header: string;
    readonly align?: Align;
    readonly emphasis?: 'normal' | 'strong' | 'quiet';
    readonly cell: (row: T) => ReactNode;
}

/**
 * The whole list, in the order given, with no sort or page controls. Reach for
 * `DataTable` instead when the server paginates; that one carries a TanStack
 * table instance and the sort/page state contract, which is dead weight for a
 * fixed list of grade weights or import runs.
 */
export function SimpleTable<T>({
    caption,
    columns,
    rows,
    rowKey,
    layout = 'wide',
    highlightRow,
}: {
    readonly caption: string;
    readonly columns: readonly SimpleTableColumn<T>[];
    readonly rows: readonly T[];
    readonly rowKey: (row: T) => string;
    readonly layout?: 'wide' | 'compact';
    readonly highlightRow?: (row: T) => boolean;
}): JSX.Element {
    return (
        <TableFrame>
            <Table
                caption={caption}
                layout={layout}
            >
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <Th
                                key={column.id}
                                align={column.align}
                            >
                                {column.header}
                            </Th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <Tr
                            key={rowKey(row)}
                            index={index}
                            highlight={highlightRow?.(row) ?? false}
                        >
                            {columns.map((column) => (
                                <Td
                                    key={column.id}
                                    align={column.align}
                                    emphasis={column.emphasis}
                                >
                                    {column.cell(row)}
                                </Td>
                            ))}
                        </Tr>
                    ))}
                </tbody>
            </Table>
        </TableFrame>
    );
}
