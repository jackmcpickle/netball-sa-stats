// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/ui/data-table';

afterEach(() => {
    cleanup();
});

interface Row {
    readonly id: string;
    readonly year: number;
}

const columns = [
    { id: 'id', header: 'ID', sortable: true, cell: (row: Row) => row.id },
    {
        id: 'year',
        header: 'YEAR',
        sortable: true,
        align: 'right' as const,
        cell: (row: Row) => row.year,
    },
];

const state = { sort: 'year', desc: true, page: 1, pageSize: 25 };

function rows(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `r${String(i)}`,
        year: 2000 + i,
    }));
}

describe('DataTable', () => {
    it('marks the sorted column with aria-sort and leaves others none', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('columnheader', { name: /YEAR/ }),
        ).toHaveAttribute('aria-sort', 'descending');
        expect(
            screen.getByRole('columnheader', { name: /ID/ }),
        ).toHaveAttribute('aria-sort', 'none');
    });

    it('flips direction when the sorted column is clicked again', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /YEAR/ }));
        expect(onChange).toHaveBeenCalledWith({
            ...state,
            desc: false,
            page: 1,
        });
    });

    it('resets to page 1 and starts descending when a new column is clicked', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(2)}
                rowKey={(row) => row.id}
                totalRows={200}
                state={{ ...state, page: 4 }}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /ID/ }));
        expect(onChange).toHaveBeenCalledWith({
            sort: 'id',
            desc: true,
            page: 1,
            pageSize: 25,
        });
    });

    it('hides pagination when every row fits on one page', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(12)}
                rowKey={(row) => row.id}
                totalRows={12}
                state={state}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.queryByRole('navigation', { name: /pagination/i }),
        ).toBeNull();
    });

    it('shows pagination and reports the next page', async () => {
        const onChange = vi.fn();
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={rows(25)}
                rowKey={(row) => row.id}
                totalRows={80}
                state={state}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: /next/i }));
        expect(onChange).toHaveBeenCalledWith({ ...state, page: 2 });
    });

    it('does not sort rows itself — it renders them in the given order', () => {
        render(
            <DataTable
                caption="Test"
                columns={columns}
                rows={[
                    { id: 'b', year: 1990 },
                    { id: 'a', year: 2020 },
                ]}
                rowKey={(row) => row.id}
                totalRows={2}
                state={state}
                onChange={vi.fn()}
            />,
        );
        const cells = screen.getAllByRole('cell');
        expect(cells[0]).toHaveTextContent('b');
    });
});
