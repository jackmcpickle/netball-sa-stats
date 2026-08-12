import { getRouteApi } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { NO_VALUE } from '@/components/format';
import { meetingNote } from '@/components/head-to-head/format';
import { RecordSummary } from '@/components/head-to-head/record-summary';
import { SeasonStrip } from '@/components/head-to-head/season-strip';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { NoteMarker } from '@/components/ui/note-marker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FieldSelect } from '@/components/ui/select';
import { SegmentedToggle } from '@/components/ui/toggle';
import type { TableState } from '@/db/queries/pagination';
import type { BandFilter, Meeting } from '@/server/dto/head-to-head.dto';
import type { Club } from '@/server/dto/shared.dto';

const routeApi = getRouteApi('/head-to-head');

const ALL_BANDS: BandFilter = 'all';

/** Hoisted: an inline array prop would be a new value on every render. */
const CLUBS_SHOWN_OPTIONS = [
    { value: false, label: 'Current clubs' },
    { value: true, label: 'All (incl. past)' },
];

/** Finals keep PlayHQ's own label; a shifted round number would mislead. */
function renderRoundCell(meeting: Meeting): ReactNode {
    if (meeting.isFinals) {
        return <span>{meeting.roundName ?? 'Finals'}</span>;
    }
    return <span className="numeric">{meeting.round ?? NO_VALUE}</span>;
}

function renderYearCell(meeting: Meeting): ReactNode {
    return <span className="numeric">{meeting.year}</span>;
}

function renderGradeCell(meeting: Meeting): ReactNode {
    return <span>{meeting.gradeName}</span>;
}

function renderTeamACell(meeting: Meeting): ReactNode {
    return <span>{meeting.teamA ?? 'TBC'}</span>;
}

function renderTeamBCell(meeting: Meeting): ReactNode {
    return <span>{meeting.teamB ?? 'TBC'}</span>;
}

function renderScoreCell(meeting: Meeting): ReactNode {
    const note = meetingNote(meeting);
    const scoreline =
        meeting.scoreA === null || meeting.scoreB === null
            ? NO_VALUE
            : `${String(meeting.scoreA)}–${String(meeting.scoreB)}`;
    return (
        <span className="numeric">
            {scoreline}
            {note !== null && <NoteMarker note={note} />}
        </span>
    );
}

function renderResultCell(meeting: Meeting): ReactNode {
    return (
        <span className="label-mono text-ink-muted">
            {meeting.result ?? NO_VALUE}
        </span>
    );
}

function clubOptions(
    clubs: readonly Club[],
): readonly { value: string; label: string }[] {
    return clubs.map((club) => ({ value: club.key, label: club.name }));
}

const MEETING_COLUMNS: readonly DataTableColumn<Meeting>[] = [
    {
        id: 'year',
        header: 'YEAR',
        emphasis: 'strong',
        sortable: true,
        cell: renderYearCell,
    },
    { id: 'round', header: 'RND', sortable: true, cell: renderRoundCell },
    {
        id: 'gradeName',
        header: 'GRADE',
        sortable: true,
        cell: renderGradeCell,
    },
    { id: 'teamA', header: 'TEAM', cell: renderTeamACell },
    {
        id: 'score',
        header: 'SCORE',
        align: 'right',
        emphasis: 'strong',
        cell: renderScoreCell,
    },
    { id: 'teamB', header: 'OPPONENT', cell: renderTeamBCell },
    { id: 'result', header: 'RES', align: 'right', cell: renderResultCell },
];

function meetingKey(meeting: Meeting): string {
    return `${String(meeting.year)}-${String(meeting.round)}-${meeting.gradeName}-${meeting.teamA ?? ''}`;
}

export function HeadToHeadPage(): JSX.Element {
    const data = routeApi.useLoaderData();
    const navigate = routeApi.useNavigate();

    // Changing any filter resets paging: page 3 of the previous pair's
    // meetings is not a meaningful destination.
    const onAChange = useCallback(
        (a: string) => {
            void navigate({
                search: (previous) => ({ ...previous, a, page: 1 }),
                resetScroll: false,
            });
        },
        [navigate],
    );

    const onBChange = useCallback(
        (b: string) => {
            void navigate({
                search: (previous) => ({ ...previous, b, page: 1 }),
                resetScroll: false,
            });
        },
        [navigate],
    );

    const onBandChange = useCallback(
        (band: BandFilter) => {
            void navigate({
                search: (previous) => ({ ...previous, band, page: 1 }),
                resetScroll: false,
            });
        },
        [navigate],
    );

    const onIncludePastChange = useCallback(
        (includePast: boolean) => {
            void navigate({
                search: (previous) => ({ ...previous, includePast }),
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

    const options = useMemo(() => clubOptions(data.clubs), [data.clubs]);

    const bandOptions = useMemo(
        () => [
            { value: ALL_BANDS, label: 'All grades' },
            ...data.bands.map((band) => ({
                value: band.tier as BandFilter,
                label: band.label,
            })),
        ],
        [data.bands],
    );

    const { a, b, h2h, meetings } = data;
    const neverMet = h2h !== null && h2h.meetings.length === 0;

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'HEAD TO HEAD'}</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>{'Club versus club'}</PageTitle>
            </div>

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <SearchableSelect
                    label="Club"
                    noun="clubs"
                    searchPlaceholder="e.g. Contax"
                    value={a?.key ?? ''}
                    options={options}
                    onValueChange={onAChange}
                />
                <SearchableSelect
                    label="Opponent"
                    noun="clubs"
                    searchPlaceholder="e.g. Garville"
                    value={b?.key ?? ''}
                    options={options}
                    onValueChange={onBChange}
                />
                {bandOptions.length > 1 && (
                    <FieldSelect
                        label="Grade band"
                        value={data.band}
                        options={bandOptions}
                        onValueChange={onBandChange}
                    />
                )}
                <SegmentedToggle
                    label="Clubs shown"
                    value={data.includePast}
                    options={CLUBS_SHOWN_OPTIONS}
                    onValueChange={onIncludePastChange}
                />
            </div>

            {h2h === null && (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {'Pick two different clubs to see their record.'}
                    </p>
                </Panel>
            )}

            {neverMet && (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        {`${a?.name ?? ''} and ${b?.name ?? ''} have never met in a recorded fixture. Fixture-level results cover 2025 onwards; earlier seasons are held as ladders only.`}
                    </p>
                </Panel>
            )}

            {h2h !== null && !neverMet && a !== null && b !== null && (
                <>
                    <RecordSummary
                        a={a}
                        b={b}
                        record={h2h.record}
                    />
                    <SeasonStrip seasons={h2h.bySeason} />
                    {meetings !== null && (
                        <DataTable
                            caption={`Meetings between ${a.name} and ${b.name}`}
                            columns={MEETING_COLUMNS}
                            rows={meetings.rows}
                            rowKey={meetingKey}
                            totalRows={meetings.totalRows}
                            state={meetings.tableState}
                            onChange={onTableChange}
                        />
                    )}
                </>
            )}
        </PageShell>
    );
}
