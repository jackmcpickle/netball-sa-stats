import { getRouteApi } from '@tanstack/react-router';
import { isNull } from 'es-toolkit';
import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { NO_VALUE } from '@/components/format';
import { meetingNote } from '@/components/head-to-head/format';
import { RecordSummary } from '@/components/head-to-head/record-summary';
import { SeasonStrip } from '@/components/head-to-head/season-strip';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
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
    { label: 'Current clubs', value: false },
    { label: 'All (incl. past)', value: true },
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
        isNull(meeting.scoreA) || isNull(meeting.scoreB)
            ? NO_VALUE
            : `${String(meeting.scoreA)}–${String(meeting.scoreB)}`;
    return (
        <span className="numeric">
            {scoreline}
            {!isNull(note) && <NoteMarker note={note} />}
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
    return clubs.map((club) => ({ label: club.name, value: club.key }));
}

const MEETING_COLUMNS: readonly DataTableColumn<Meeting>[] = [
    {
        cell: renderYearCell,
        emphasis: 'strong',
        header: 'YEAR',
        id: 'year',
        sortable: true,
    },
    { cell: renderRoundCell, header: 'RND', id: 'round', sortable: true },
    {
        cell: renderGradeCell,
        header: 'GRADE',
        id: 'gradeName',
        sortable: true,
    },
    { cell: renderTeamACell, header: 'TEAM', id: 'teamA' },
    {
        align: 'right',
        cell: renderScoreCell,
        emphasis: 'strong',
        header: 'SCORE',
        id: 'score',
    },
    { cell: renderTeamBCell, header: 'OPPONENT', id: 'teamB' },
    { align: 'right', cell: renderResultCell, header: 'RES', id: 'result' },
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
                resetScroll: false,
                search: (previous) => ({ ...previous, a, page: 1 }),
            });
        },
        [navigate],
    );

    const onBChange = useCallback(
        (b: string) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({ ...previous, b, page: 1 }),
            });
        },
        [navigate],
    );

    const onBandChange = useCallback(
        (band: BandFilter) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({ ...previous, band, page: 1 }),
            });
        },
        [navigate],
    );

    const onIncludePastChange = useCallback(
        (includePast: boolean) => {
            void navigate({
                resetScroll: false,
                search: (previous) => ({ ...previous, includePast }),
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

    const options = useMemo(() => clubOptions(data.clubs), [data.clubs]);

    const bandOptions = useMemo(
        () => [
            { label: 'All grades', value: ALL_BANDS },
            ...data.bands.map((band) => ({
                label: band.label,
                // SAFETY: `BandFilter` is `number | typeof ALL_BANDS`, and a
                // band tier is always a number.
                value: band.tier as BandFilter,
            })),
        ],
        [data.bands],
    );

    const { a, b, h2h, meetings } = data;
    const neverMet = !isNull(h2h) && h2h.meetings.length === 0;
    /** The loaded record, or `null` when the pair has never met. */
    const record = neverMet ? null : h2h;
    /** Both clubs, or `null` until the user has picked a pair. */
    const pair = isNull(a) || isNull(b) ? null : { a, b };

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>HEAD TO HEAD</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>Club versus club</PageTitle>
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

            {isNull(h2h) && (
                <Panel className="p-8">
                    <p className="text-ink-body">
                        Pick two different clubs to see their record.
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

            {!isNull(record) && !isNull(pair) && (
                <>
                    <RecordSummary
                        a={pair.a}
                        b={pair.b}
                        record={record.record}
                    />
                    <SeasonStrip seasons={record.bySeason} />
                    {!isNull(meetings) && (
                        <DataTable
                            caption={`Meetings between ${pair.a.name} and ${pair.b.name}`}
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
