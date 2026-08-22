import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, formatPercent } from '@/components/format';
import { SeasonSelector } from '@/components/ladders/season-selector';
import { ClubLink } from '@/components/links';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { NoteMarker } from '@/components/ui/note-marker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FieldSelect } from '@/components/ui/select';
import type { TableState } from '@/db/queries/pagination';
import type { LadderRow } from '@/server/dto/ladders.dto';

const routeApi = getRouteApi('/ladders');

function emptyStateMessage(year: number | null): string {
    return isNull(year)
        ? 'No seasons are recorded yet.'
        : `No grades are recorded for ${String(year)}.`;
}

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
            {!isNull(row.notes) && <NoteMarker note={row.notes} />}
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

const LADDER_COLUMNS: readonly DataTableColumn<LadderRow>[] = [
    {
        cell: renderPositionCell,
        emphasis: 'strong',
        header: 'POS',
        id: 'position',
        sortable: true,
    },
    {
        cell: renderTeamCell,
        emphasis: 'strong',
        header: 'TEAM',
        id: 'team',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderPlayedCell,
        header: 'P',
        id: 'played',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderWonCell,
        header: 'W',
        id: 'won',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderLostCell,
        header: 'L',
        id: 'lost',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderDrawnCell,
        header: 'D',
        id: 'drawn',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderGoalsForCell,
        header: 'FOR',
        id: 'goalsFor',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderGoalsAgainstCell,
        header: 'AGST',
        id: 'goalsAgainst',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderPercentageCell,
        header: 'GOAL %',
        id: 'percentage',
        sortable: true,
    },
    {
        align: 'right',
        cell: renderPointsCell,
        emphasis: 'strong',
        header: 'PTS',
        id: 'points',
        sortable: true,
    },
];

export function LaddersPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onYearChange = useCallback(
        (year: number) => {
            // Grade keys are season-scoped, so changing year clears the grade
            // and the loader falls back to that season's first grade. A full
            // replace also drops sort/page, since page 3 of the old season is
            // not a meaningful destination.
            void navigate({
                resetScroll: false,
                search: (previous) => ({
                    competition: previous.competition,
                    year,
                }),
            });
        },
        [navigate],
    );

    const onGradeChange = useCallback(
        (grade: string) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({ ...previous, grade, page: 1 }),
            });
        },
        [navigate],
    );

    const onTableChange = useCallback(
        (next: TableState) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({
                    ...previous,
                    dir: next.desc ? 'desc' : 'asc',
                    page: next.page,
                    pageSize: next.pageSize,
                    sort: next.sort,
                }),
            });
        },
        [navigate],
    );

    const onCompetitionChange = useCallback(
        (competition: string) => {
            void navigate({
                resetScroll: false,
                search: { competition },
            });
        },
        [navigate],
    );

    const competitionOptions = useMemo(
        () =>
            data.competitions.map((competition) => ({
                label: competition.shortName,
                value: competition.key,
            })),
        [data.competitions],
    );

    const yearOptions = useMemo(
        () => data.years.map((year) => ({ label: String(year), value: year })),
        [data.years],
    );

    const gradeOptions = useMemo(
        () =>
            data.grades.map((grade) => ({
                hint: grade.competition.name,
                label: grade.name,
                value: grade.key,
            })),
        [data.grades],
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
            <Eyebrow>LADDERS</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>Where every team finished</PageTitle>
            </div>

            <p className="mb-6 max-w-[56ch] text-ink-body">
                Ladders are scoped to one league. Open another association from
                the league picker, or from{' '}
                <a
                    href="/leagues"
                    className="text-ink underline decoration-rule underline-offset-2"
                >
                    Leagues
                </a>
                .
            </p>

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                {competitionOptions.length > 0 && data.competition ? (
                    <FieldSelect
                        label="League"
                        value={data.competition.key}
                        options={competitionOptions}
                        onValueChange={onCompetitionChange}
                    />
                ) : null}
                <SeasonSelector
                    year={data.year}
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
                        {`${data.ladder.grade.competition.name} · ${data.ladder.grade.name} · ${String(data.ladder.totalRows)} teams`}
                    </p>
                    <DataTable
                        caption={`${data.ladder.grade.name} ladder, ${String(data.ladder.grade.year)}`}
                        columns={LADDER_COLUMNS}
                        rows={data.ladder.rows}
                        rowKey={rowKey}
                        totalRows={data.ladder.totalRows}
                        state={data.ladder.tableState}
                        onChange={onTableChange}
                        highlightRow={highlightRow}
                    />
                    <p className="mt-4 max-w-[64ch] text-[13px] text-ink-muted">
                        Positions are regular-season ladder finishes, not finals
                        results. Two points for a win, one for a draw; teams
                        level on points are separated by goal percentage.
                    </p>
                </>
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {emptyStateMessage(data.year)}
                    </p>
                </Panel>
            )}
        </PageShell>
    );
}
