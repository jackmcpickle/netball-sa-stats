import type { JSX } from 'react';
import {
    formatPercent,
    formatPosition,
    formatRecord,
} from '@/components/format';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';
import type { ClubGradeResult } from '@/data/types';

export function ClubResultsTable({
    clubName,
    results,
}: {
    readonly clubName: string;
    readonly results: readonly ClubGradeResult[];
}): JSX.Element {
    return (
        <TableFrame>
            <Table caption={`Every graded finish for ${clubName}`}>
                <thead>
                    <tr>
                        <Th>{'SEASON'}</Th>
                        <Th>{'GRADE'}</Th>
                        <Th>{'COMPETITION'}</Th>
                        <Th align="right">{'POS'}</Th>
                        <Th align="right">{'W–L–D'}</Th>
                        <Th align="right">{'GOAL %'}</Th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result, index) => (
                        <Tr
                            key={`${result.gradeKey}-${String(result.year)}`}
                            index={index}
                        >
                            <Td>
                                <span className="numeric text-[13px] text-ink">
                                    {result.year}
                                </span>
                            </Td>
                            <Td emphasis="strong">{result.gradeName}</Td>
                            <Td emphasis="quiet">{result.competitionName}</Td>
                            <Td align="right">
                                <span
                                    className={`numeric font-semibold ${
                                        result.ladderPosition === 1
                                            ? 'text-rise'
                                            : result.ladderPosition <= 3
                                              ? 'text-ink'
                                              : 'text-ink-muted'
                                    }`}
                                >
                                    {formatPosition(
                                        result.ladderPosition,
                                        result.teamCount,
                                    )}
                                </span>
                            </Td>
                            <Td align="right">
                                <span className="numeric">
                                    {formatRecord(
                                        result.won,
                                        result.lost,
                                        result.drawn,
                                    )}
                                </span>
                            </Td>
                            <Td align="right">
                                <span className="numeric">
                                    {formatPercent(result.percentage)}
                                </span>
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </Table>
        </TableFrame>
    );
}
