import { getRouteApi } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, formatPercent } from '@/components/format';
import { ClubLink } from '@/components/links';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { NoteMarker } from '@/components/ui/note-marker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FieldSelect } from '@/components/ui/select';
import type { LadderRow } from '@/data/types';
import type { TableState } from '@/db/queries/pagination';

const routeApi = getRouteApi('/ladders');

function renderPositionCell(row: LadderRow): ReactNode {
    return <span className="numeric">{row.position}</span>;
}

function renderTeamCell(row: LadderRow): ReactNode {
    return (
        <span className="flex items-center gap-3">
            <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full bg-current ${accentText(row.club.accent)}`}
            />
            <ClubLink
                clubKey={row.club.key}
                className="text-[15px] font-semibold text-ink no-underline hover:underline"
            >
                {row.displayName}
            </ClubLink>
            {row.notes !== null && <NoteMarker note={row.notes} />}
        </span>
    );
}

function renderPlayedCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.played)}</span>;
}

function renderWonCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.won)}</span>;
}

function renderLostCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.lost)}</span>;
}

function renderDrawnCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.drawn)}</span>;
}

function renderGoalsForCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.goalsFor)}</span>;
}

function renderGoalsAgainstCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.goalsAgainst)}</span>;
}

function renderPercentageCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatPercent(row.percentage)}</span>;
}

function renderPointsCell(row: LadderRow): ReactNode {
    return <span className="numeric">{formatNumber(row.points)}</span>;
}

export function LaddersPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onYearChange = useCallback(
        (year: number) => {
            // Grade keys are season-scoped, so changing year clears the grade
            // and the loader falls back to that season's first grade. A full
            // replace also drops sort/page, since page 3 of the old season is
            // not a meaningful destination.
            void navigate({ search: { year }, resetScroll: false });
        },
        [navigate],
    );

    const onGradeChange = useCallback(
        (grade: string) => {
            void navigate({
                search: (previous) => ({ ...previous, grade, page: 1 }),
                resetScroll: false,
            });
        },
        [navigate],
    );

    const onTableChange = useCallback(
        (next: TableState) => {
            void navigate({
                search: (previous) => ({
                    ...previous,
                    sort: next.sort,
                    dir: next.desc ? 'desc' : 'asc',
                    page: next.page,
                    pageSize: next.pageSize,
                }),
                resetScroll: false,
            });
        },
        [navigate],
    );

    const yearOptions = useMemo(
        () => data.years.map((year) => ({ value: year, label: String(year) })),
        [data.years],
    );

    const gradeOptions = useMemo(
        () =>
            data.grades.map((grade) => ({
                value: grade.key,
                label: grade.name,
                hint: grade.competition.name,
            })),
        [data.grades],
    );

    const columns = useMemo<readonly DataTableColumn<LadderRow>[]>(
        () => [
            {
                id: 'position',
                header: 'POS',
                emphasis: 'strong',
                sortable: true,
                cell: renderPositionCell,
            },
            {
                id: 'team',
                header: 'TEAM',
                emphasis: 'strong',
                sortable: true,
                cell: renderTeamCell,
            },
            {
                id: 'played',
                header: 'P',
                align: 'right',
                sortable: true,
                cell: renderPlayedCell,
            },
            {
                id: 'won',
                header: 'W',
                align: 'right',
                sortable: true,
                cell: renderWonCell,
            },
            {
                id: 'lost',
                header: 'L',
                align: 'right',
                sortable: true,
                cell: renderLostCell,
            },
            {
                id: 'drawn',
                header: 'D',
                align: 'right',
                sortable: true,
                cell: renderDrawnCell,
            },
            {
                id: 'goalsFor',
                header: 'FOR',
                align: 'right',
                sortable: true,
                cell: renderGoalsForCell,
            },
            {
                id: 'goalsAgainst',
                header: 'AGST',
                align: 'right',
                sortable: true,
                cell: renderGoalsAgainstCell,
            },
            {
                id: 'percentage',
                header: 'GOAL %',
                align: 'right',
                sortable: true,
                cell: renderPercentageCell,
            },
            {
                id: 'points',
                header: 'PTS',
                align: 'right',
                emphasis: 'strong',
                sortable: true,
                cell: renderPointsCell,
            },
        ],
        [],
    );

    const rowKey = useCallback(
        (row: LadderRow) => `${row.club.key}-${String(row.position)}`,
        [],
    );

    const highlightRow = useCallback(
        (row: LadderRow) => row.position === 1,
        [],
    );

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'LADDERS'}</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>{'Where every team finished'}</PageTitle>
            </div>

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <FieldSelect
                    label="Season"
                    value={data.year}
                    options={yearOptions}
                    onValueChange={onYearChange}
                />
                {gradeOptions.length > 0 && (
                    <SearchableSelect
                        label="Grade"
                        noun="grades"
                        searchPlaceholder="e.g. Premier, Junior 4"
                        value={data.ladder?.grade.key ?? gradeOptions[0].value}
                        options={gradeOptions}
                        onValueChange={onGradeChange}
                    />
                )}
            </div>

            {data.ladder ? (
                <>
                    <p className="mb-4 text-sm text-ink-muted">
                        {`${data.ladder.grade.competition.name} · ${data.ladder.grade.name} · ${String(data.ladder.rows.length)} teams`}
                    </p>
                    <DataTable
                        caption={`${data.ladder.grade.name} ladder, ${String(data.ladder.grade.year)}`}
                        columns={columns}
                        rows={data.ladder.rows}
                        rowKey={rowKey}
                        totalRows={data.ladder.totalRows}
                        state={data.ladder.tableState}
                        onChange={onTableChange}
                        highlightRow={highlightRow}
                    />
                    <p className="mt-4 max-w-[64ch] text-[13px] text-ink-muted">
                        {
                            'Positions are regular-season ladder finishes, not finals results. Two points for a win, one for a draw; teams level on points are separated by goal percentage.'
                        }
                    </p>
                </>
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {`No grades are recorded for ${String(data.year)}.`}
                    </p>
                </Panel>
            )}
        </PageShell>
    );
}
