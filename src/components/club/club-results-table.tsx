import { isNull } from 'es-toolkit';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import {
    formatPercent,
    formatPosition,
    formatRecord,
} from '@/components/format';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { NoteMarker } from '@/components/ui/note-marker';
import type { TableState } from '@/db/queries/pagination';
import type { ClubGradeResult } from '@/server/dto/club-profile.dto';

function renderYearCell(result: ClubGradeResult): ReactNode {
    return <span className="numeric text-[13px] text-ink">{result.year}</span>;
}

function renderGradeCell(result: ClubGradeResult): ReactNode {
    return (
        <>
            {result.gradeName}
            {!isNull(result.notes) && <NoteMarker note={result.notes} />}
        </>
    );
}

function renderCompetitionCell(result: ClubGradeResult): ReactNode {
    return result.competitionName;
}

/** Premiership wins read as a rise, other podium finishes as plain ink. */
function positionTone(ladderPosition: number): string {
    if (ladderPosition === 1) {
        return 'text-rise';
    }
    return ladderPosition <= 3 ? 'text-ink' : 'text-ink-muted';
}

function renderPositionCell(result: ClubGradeResult): ReactNode {
    return (
        <span
            className={`numeric font-semibold ${positionTone(result.ladderPosition)}`}
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
                cell: renderYearCell,
                header: 'SEASON',
                id: 'year',
                sortable: true,
            },
            {
                cell: renderGradeCell,
                emphasis: 'strong',
                header: 'GRADE',
                id: 'grade',
                sortable: true,
            },
            {
                cell: renderCompetitionCell,
                emphasis: 'quiet',
                header: 'COMPETITION',
                id: 'competition',
            },
            {
                align: 'right',
                cell: renderPositionCell,
                header: 'POS',
                id: 'position',
                sortable: true,
            },
            {
                align: 'right',
                cell: renderRecordCell,
                header: 'W–L–D',
                id: 'won',
                sortable: true,
            },
            {
                align: 'right',
                cell: renderPercentageCell,
                header: 'GOAL %',
                id: 'percentage',
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
