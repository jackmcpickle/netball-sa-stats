import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { accentText } from '@/components/accent';
import {
    describeMovement,
    formatNumber,
    formatPercent,
} from '@/components/format';
import { ClubLink } from '@/components/links';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { ShareBar } from '@/components/ui/share-bar';
import type { TableState } from '@/db/queries/pagination';
import type { ChampionshipRow } from '@/server/dto/rankings.dto';

const MOVEMENT_TONE = {
    up: 'text-rise',
    down: 'text-fall',
    level: 'text-ink-faint',
    new: 'text-ink-faint',
} as const;

function renderRankCell(row: ChampionshipRow): ReactNode {
    return <span className="numeric text-lg">{row.rank}</span>;
}

function renderClubCell(row: ChampionshipRow): ReactNode {
    return (
        <span className="flex items-center gap-3">
            <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full bg-current ${accentText(row.club.accent)}`}
            />
            <ClubLink
                clubKey={row.club.key}
                className="text-base font-semibold text-ink no-underline hover:underline"
            >
                {row.club.name}
            </ClubLink>
        </span>
    );
}

function renderPointsCell(row: ChampionshipRow): ReactNode {
    return <span className="numeric">{formatNumber(row.points, 1)}</span>;
}

function renderTeamsCell(row: ChampionshipRow): ReactNode {
    return <span className="numeric">{row.teams}</span>;
}

function renderWinPercentageCell(row: ChampionshipRow): ReactNode {
    return <span className="numeric">{formatPercent(row.winPercentage)}</span>;
}

function renderMinorPremiershipsCell(row: ChampionshipRow): ReactNode {
    return <span className="numeric">{row.minorPremierships}</span>;
}

function renderMovementCell(
    row: ChampionshipRow,
    coverageChanged: boolean,
    leaderPoints: number,
): JSX.Element {
    const movement = describeMovement(row.rank, row.previousRank);
    return (
        <span className="flex items-center justify-end gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex">
                <ShareBar
                    share={leaderPoints > 0 ? row.points / leaderPoints : 0}
                    accent={accentText(row.club.accent)}
                />
            </span>
            {coverageChanged ? (
                <span
                    className="numeric w-12 text-right text-[13px] text-ink-faint sm:w-14"
                    title="Competition coverage, methodology, or a gap in seasons changed since the previous ranked season, so this season is not directly comparable — no movement is shown."
                >
                    <span className="sr-only">
                        Not comparable to the previous ranked season —
                        competition coverage changed
                    </span>
                    <span aria-hidden="true">—</span>
                </span>
            ) : (
                <span
                    className={`numeric w-12 text-right text-[13px] font-semibold sm:w-14 ${MOVEMENT_TONE[movement.direction]}`}
                >
                    <span className="sr-only">{movement.description}</span>
                    <span aria-hidden="true">{movement.label}</span>
                </span>
            )}
        </span>
    );
}

export function ChampionshipTable({
    rows,
    year,
    previousYear,
    coverageChanged,
    totalRows,
    state,
    onChange,
}: {
    readonly rows: readonly ChampionshipRow[];
    readonly year: number;
    readonly previousYear: number | null;
    /**
     * True when this season's competitions differ from the previous ranked
     * season's (e.g. Premier League and Reserves joining), so a rank
     * comparison across that boundary would misrepresent movement.
     */
    readonly coverageChanged: boolean;
    readonly totalRows: number;
    readonly state: TableState;
    readonly onChange: (next: TableState) => void;
}): JSX.Element {
    const leaderPoints = rows[0]?.points ?? 1;

    const movementHeader = coverageChanged
        ? 'COVERAGE CHANGED'
        : previousYear === null
          ? 'VS PREVIOUS'
          : `VS ${String(previousYear)}`;

    const columns = useMemo<readonly DataTableColumn<ChampionshipRow>[]>(
        () => [
            {
                id: 'rank',
                header: 'RANK',
                emphasis: 'strong',
                sortable: true,
                cell: renderRankCell,
            },
            {
                id: 'club',
                header: 'CLUB',
                emphasis: 'strong',
                sortable: true,
                cell: renderClubCell,
            },
            {
                id: 'points',
                header: 'CH. POINTS',
                align: 'right',
                emphasis: 'strong',
                sortable: true,
                cell: renderPointsCell,
            },
            {
                id: 'teams',
                header: 'TEAMS',
                align: 'right',
                sortable: true,
                cell: renderTeamsCell,
            },
            {
                id: 'winPercentage',
                header: 'WIN %',
                align: 'right',
                cell: renderWinPercentageCell,
            },
            {
                id: 'minorPremierships',
                header: 'LADDERS WON',
                align: 'right',
                cell: renderMinorPremiershipsCell,
            },
            {
                id: 'movement',
                header: movementHeader,
                align: 'right',
                cell: (row): JSX.Element =>
                    renderMovementCell(row, coverageChanged, leaderPoints),
            },
        ],
        [coverageChanged, leaderPoints, movementHeader],
    );

    const rowKey = useCallback((row: ChampionshipRow) => row.club.key, []);

    return (
        <DataTable
            caption={`Club championship standings for ${String(year)}`}
            columns={columns}
            rows={rows}
            rowKey={rowKey}
            totalRows={totalRows}
            state={state}
            onChange={onChange}
        />
    );
}
