import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import {
    describeMovement,
    formatNumber,
    formatPercent,
} from '@/components/format';
import { ClubLink } from '@/components/links';
import { ShareBar } from '@/components/ui/share-bar';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';
import type { ChampionshipRow } from '@/data/types';

const MOVEMENT_TONE = {
    up: 'text-rise',
    down: 'text-fall',
    level: 'text-ink-faint',
    new: 'text-ink-faint',
} as const;

export function ChampionshipTable({
    rows,
    year,
    previousYear,
    coverageChanged,
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
}): JSX.Element {
    const leaderPoints = rows[0]?.points ?? 1;

    return (
        <TableFrame>
            <Table caption={`Club championship standings for ${String(year)}`}>
                <thead>
                    <tr>
                        <Th>{'RANK'}</Th>
                        <Th>{'CLUB'}</Th>
                        <Th align="right">{'CH. POINTS'}</Th>
                        <Th align="right">{'TEAMS'}</Th>
                        <Th align="right">{'WIN %'}</Th>
                        <Th align="right">{'LADDERS WON'}</Th>
                        <Th align="right">
                            {coverageChanged
                                ? 'COVERAGE CHANGED'
                                : previousYear === null
                                  ? 'VS PREVIOUS'
                                  : `VS ${String(previousYear)}`}
                        </Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const movement = describeMovement(
                            row.rank,
                            row.previousRank,
                        );
                        return (
                            <Tr
                                key={row.club.key}
                                index={index}
                            >
                                <Td emphasis="strong">
                                    <span className="numeric text-lg">
                                        {row.rank}
                                    </span>
                                </Td>
                                <Td emphasis="strong">
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
                                </Td>
                                <Td
                                    align="right"
                                    emphasis="strong"
                                >
                                    <span className="numeric">
                                        {formatNumber(row.points, 1)}
                                    </span>
                                </Td>
                                <Td align="right">
                                    <span className="numeric">{row.teams}</span>
                                </Td>
                                <Td align="right">
                                    <span className="numeric">
                                        {formatPercent(row.winPercentage)}
                                    </span>
                                </Td>
                                <Td align="right">
                                    <span className="numeric">
                                        {row.minorPremierships}
                                    </span>
                                </Td>
                                <Td align="right">
                                    <span className="flex items-center justify-end gap-2 sm:gap-3">
                                        <span className="hidden sm:inline-flex">
                                            <ShareBar
                                                share={
                                                    leaderPoints > 0
                                                        ? row.points /
                                                          leaderPoints
                                                        : 0
                                                }
                                                accent={accentText(
                                                    row.club.accent,
                                                )}
                                            />
                                        </span>
                                        {coverageChanged ? (
                                            <span
                                                className="numeric w-12 text-right text-[13px] text-ink-faint sm:w-14"
                                                title="Competition coverage, methodology, or a gap in seasons changed since the previous ranked season, so this season is not directly comparable — no movement is shown."
                                            >
                                                <span className="sr-only">
                                                    {
                                                        'Not comparable to the previous ranked season — competition coverage changed'
                                                    }
                                                </span>
                                                <span aria-hidden="true">
                                                    {'—'}
                                                </span>
                                            </span>
                                        ) : (
                                            <span
                                                className={`numeric w-12 text-right text-[13px] font-semibold sm:w-14 ${MOVEMENT_TONE[movement.direction]}`}
                                            >
                                                <span className="sr-only">
                                                    {movement.description}
                                                </span>
                                                <span aria-hidden="true">
                                                    {movement.label}
                                                </span>
                                            </span>
                                        )}
                                    </span>
                                </Td>
                            </Tr>
                        );
                    })}
                </tbody>
            </Table>
        </TableFrame>
    );
}
