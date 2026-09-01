// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { SimpleTable } from '@/components/ui/simple-table';

afterEach(() => {
    cleanup();
});

interface Row {
    readonly id: string;
    readonly year: number;
}

const columns = [
    { id: 'id', header: 'ID', cell: (row: Row) => row.id },
    {
        id: 'year',
        header: 'YEAR',
        align: 'right' as const,
        cell: (row: Row) => row.year,
    },
];

const rows: Row[] = [
    { id: 'b', year: 1990 },
    { id: 'a', year: 2020 },
];

describe('SimpleTable', () => {
    it('renders every row in the given order', () => {
        render(
            <SimpleTable
                caption="Test"
                columns={columns}
                rowKey={(row) => row.id}
                rows={rows}
            />,
        );
        const cells = screen.getAllByRole('cell');
        expect(cells).toHaveLength(4);
        expect(cells[0]).toHaveTextContent('b');
        expect(cells[2]).toHaveTextContent('a');
    });

    it('offers no sort controls, since the caller fixes the order', () => {
        render(
            <SimpleTable
                caption="Test"
                columns={columns}
                rowKey={(row) => row.id}
                rows={rows}
            />,
        );
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(
            screen.getByRole('columnheader', { name: 'YEAR' }),
        ).not.toHaveAttribute('aria-sort');
    });

    it('highlights only the rows the caller marks', () => {
        render(
            <SimpleTable
                caption="Test"
                columns={columns}
                highlightRow={(row) => row.id === 'a'}
                rowKey={(row) => row.id}
                rows={rows}
            />,
        );
        const [first, second] = screen.getAllByRole('row').slice(1);
        expect(first).not.toHaveClass('bg-paper-sunken');
        expect(second).toHaveClass('bg-paper-sunken');
    });
});
