import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { NO_VALUE } from '@/components/format';
import { HeadToHeadLink } from '@/components/head-to-head-link';
import { SeasonSelector } from '@/components/ladders/season-selector';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { NoteMarker } from '@/components/ui/note-marker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { TableState } from '@/db/queries/pagination';
import type { ResultRow } from '@/server/dto/results.dto';

const routeApi = getRouteApi('/results');

const DATE_FORMAT = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
});

/** Why a scoreline on this row is absent or cannot be read as goals shot. */
function statusNote(row: ResultRow): string | null {
    switch (row.status) {
        case 'forfeit': {
            return 'Forfeit. PlayHQ records a nominal 0–20 scoreline, so the margin is not shown.';
        }
        case 'no_result': {
            return 'No result recorded.';
        }
        case 'scheduled': {
            return 'Not yet played.';
        }
        case 'bye': {
            return 'Bye. This team had no opponent this round.';
        }
        case 'final': {
            return null;
        }
        default: {
            return null;
        }
    }
}

/** Finals keep PlayHQ's own label; the shifted round number would mislead. */
function renderRoundCell(row: ResultRow): ReactNode {
    if (row.isFinals) {
        return <span>{row.roundName ?? 'Finals'}</span>;
    }
    return <span className="numeric">{row.round ?? NO_VALUE}</span>;
}

function renderDateCell(row: ResultRow): ReactNode {
    return (
        <span className="numeric text-ink-muted">
            {isNull(row.playedAt)
                ? NO_VALUE
                : DATE_FORMAT.format(new Date(row.playedAt * 1000))}
        </span>
    );
}

/** `TBC` is a real state: a scheduled final can have undecided sides. */
function renderHomeCell(row: ResultRow): ReactNode {
    return <span>{row.homeTeamName ?? 'TBC'}</span>;
}

function renderAwayCell(row: ResultRow): ReactNode {
    return <span>{row.awayTeamName ?? 'TBC'}</span>;
}

function renderScoreCell(row: ResultRow): ReactNode {
    const note = statusNote(row);
    const scoreline =
        isNull(row.homeScore) || isNull(row.awayScore)
            ? NO_VALUE
            : `${String(row.homeScore)}–${String(row.awayScore)}`;
    return (
        <span className="numeric">
            {scoreline}
            {!isNull(note) && <NoteMarker note={note} />}
        </span>
    );
}

function renderMarginCell(row: ResultRow): ReactNode {
    return <span className="numeric">{row.margin ?? NO_VALUE}</span>;
}

/** Only rendered where two different clubs are present — see `canCompare`. */
function renderCompareCell(row: ResultRow): ReactNode {
    if (!row.canCompare || isNull(row.homeClubKey) || isNull(row.awayClubKey)) {
        return null;
    }
    return (
        <HeadToHeadLink
            a={row.homeClubKey}
            b={row.awayClubKey}
            className="text-[13px] text-ink-muted no-underline hover:underline"
        >
            H2H
        </HeadToHeadLink>
    );
}

const RESULT_COLUMNS: readonly DataTableColumn<ResultRow>[] = [
    {
        id: 'round',
        header: 'RND',
        emphasis: 'strong',
        sortable: true,
        cell: renderRoundCell,
    },
    { id: 'playedAt', header: 'DATE', sortable: true, cell: renderDateCell },
    { id: 'home', header: 'HOME', sortable: true, cell: renderHomeCell },
    {
        id: 'score',
        header: 'SCORE',
        align: 'right',
        emphasis: 'strong',
        cell: renderScoreCell,
    },
    { id: 'away', header: 'AWAY', sortable: true, cell: renderAwayCell },
    {
        id: 'margin',
        header: 'MARGIN',
        align: 'right',
        sortable: true,
        cell: renderMarginCell,
    },
    { id: 'compare', header: '', align: 'right', cell: renderCompareCell },
];

function fixtureKey(row: ResultRow): string {
    return `${String(row.round)}-${row.homeTeamName ?? 'tbc'}-${row.awayTeamName ?? 'tbc'}`;
}

function emptyStateMessage(year: number | null, hasGrades: boolean): string {
    if (isNull(year)) {
        return 'No seasons are recorded yet.';
    }
    if (!hasGrades) {
        return `No grades are recorded for ${String(year)}.`;
    }
    return `No fixtures are recorded for this grade. Fixture-level results cover 2025 onwards; earlier seasons are held as ladders only.`;
}

export function ResultsPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    const onYearChange = useCallback(
        (year: number) => {
            // Grade keys are season-scoped, so changing year clears the grade
            // and the loader falls back to that season's first grade.
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

    const { fixtures } = data;

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>MATCH RESULTS</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>Every fixture, round by round</PageTitle>
            </div>

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
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
                        value={fixtures?.grade.key ?? gradeOptions[0].value}
                        options={gradeOptions}
                        onValueChange={onGradeChange}
                    />
                )}
            </div>

            {fixtures ? (
                <>
                    <p className="mb-4 text-sm text-ink-muted">
                        {`${fixtures.grade.competition.name} · ${fixtures.grade.name} · ${String(fixtures.totalRows)} fixtures`}
                    </p>
                    <DataTable
                        caption={`${fixtures.grade.name} fixtures, ${String(fixtures.grade.year)}`}
                        columns={RESULT_COLUMNS}
                        rows={fixtures.rows}
                        rowKey={fixtureKey}
                        totalRows={fixtures.totalRows}
                        state={fixtures.tableState}
                        onChange={onTableChange}
                    />
                    <p className="mt-4 max-w-[64ch] text-[13px] text-ink-muted">
                        Finals are labelled by name rather than round number.
                        Forfeits carry PlayHQ’s nominal 0–20 scoreline, so no
                        margin is shown for them.
                    </p>
                </>
            ) : (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {emptyStateMessage(data.year, data.grades.length > 0)}
                    </p>
                </Panel>
            )}
        </PageShell>
    );
}
