import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import {
    formatPercent,
    formatPosition,
    formatRecord,
} from '@/components/format';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { NoteMarker } from '@/components/ui/note-marker';
import type { ClubGradeResult } from '@/data/types';
import type { TableState } from '@/db/queries/pagination';

function renderYearCell(result: ClubGradeResult): ReactNode {
    return <span className="numeric text-[13px] text-ink">{result.year}</span>;
}

function renderGradeCell(result: ClubGradeResult): ReactNode {
    return (
        <>
            {result.gradeName}
            {result.notes !== null && <NoteMarker note={result.notes} />}
        </>
    );
}

function renderCompetitionCell(result: ClubGradeResult): ReactNode {
    return result.competitionName;
}

function renderPositionCell(result: ClubGradeResult): ReactNode {
    return (
        <span
            className={`numeric font-semibold ${
                result.ladderPosition === 1
                    ? 'text-rise'
                    : result.ladderPosition <= 3
                      ? 'text-ink'
                      : 'text-ink-muted'
            }`}
        >
            {formatPosition(result.ladderPosition, result.teamCount)}
        </span>
    );
}

function renderRecordCell(result: ClubGradeResult): ReactNode {
    return (
        <span className="numeric">
            {formatRecord(result.won, result.lost, result.drawn)}
        </span>
    );
}

function renderPercentageCell(result: ClubGradeResult): ReactNode {
    return <span className="numeric">{formatPercent(result.percentage)}</span>;
}

export function ClubResultsTable({
    clubName,
    results,
    totalRows,
    state,
    onChange,
}: {
    readonly clubName: string;
    readonly results: readonly ClubGradeResult[];
    readonly totalRows: number;
    readonly state: TableState;
    readonly onChange: (next: TableState) => void;
}): JSX.Element {
    const columns = useMemo<readonly DataTableColumn<ClubGradeResult>[]>(
        () => [
            {
                id: 'year',
                header: 'SEASON',
                sortable: true,
                cell: renderYearCell,
            },
            {
                id: 'grade',
                header: 'GRADE',
                emphasis: 'strong',
                sortable: true,
                cell: renderGradeCell,
            },
            {
                id: 'competition',
                header: 'COMPETITION',
                emphasis: 'quiet',
                cell: renderCompetitionCell,
            },
            {
                id: 'position',
                header: 'POS',
                align: 'right',
                sortable: true,
                cell: renderPositionCell,
            },
            {
                id: 'won',
                header: 'W–L–D',
                align: 'right',
                sortable: true,
                cell: renderRecordCell,
            },
            {
                id: 'percentage',
                header: 'GOAL %',
                align: 'right',
                cell: renderPercentageCell,
            },
        ],
        [],
    );

    const rowKey = useCallback(
        (result: ClubGradeResult) =>
            `${result.gradeKey}-${String(result.year)}`,
        [],
    );

    return (
        <DataTable
            caption={`Every graded finish for ${clubName}`}
            columns={columns}
            rows={results}
            rowKey={rowKey}
            totalRows={totalRows}
            state={state}
            onChange={onChange}
        />
    );
}
