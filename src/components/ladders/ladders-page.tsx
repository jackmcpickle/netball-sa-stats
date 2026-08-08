import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { accentText } from '@/components/accent';
import { formatNumber, formatPercent } from '@/components/format';
import { ClubLink } from '@/components/links';
import { Eyebrow, PageShell, PageTitle, Panel } from '@/components/ui/layout';
import { FieldSelect } from '@/components/ui/select';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';

const routeApi = getRouteApi('/ladders');

export function LaddersPage(): JSX.Element {
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
                search: (previous) => ({ ...previous, grade }),
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

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>{'LADDERS'}</Eyebrow>
            <div className="mt-4 mb-6">
                <PageTitle>{'Where every team finished'}</PageTitle>
            </div>

            <div className="mb-6 flex flex-wrap gap-4">
                <FieldSelect
                    label="Season"
                    value={data.year}
                    options={yearOptions}
                    onValueChange={onYearChange}
                />
                {gradeOptions.length > 0 && (
                    <FieldSelect
                        label="Grade"
                        wide
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
                    <TableFrame>
                        <Table
                            caption={`${data.ladder.grade.name} ladder, ${String(data.ladder.grade.year)}`}
                        >
                            <thead>
                                <tr>
                                    <Th>{'POS'}</Th>
                                    <Th>{'TEAM'}</Th>
                                    <Th align="right">{'P'}</Th>
                                    <Th align="right">{'W'}</Th>
                                    <Th align="right">{'L'}</Th>
                                    <Th align="right">{'D'}</Th>
                                    <Th align="right">{'FOR'}</Th>
                                    <Th align="right">{'AGST'}</Th>
                                    <Th align="right">{'GOAL %'}</Th>
                                    <Th align="right">{'PTS'}</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.ladder.rows.map((row, index) => (
                                    <Tr
                                        key={`${row.club.key}-${String(row.position)}`}
                                        index={index}
                                        highlight={row.position === 1}
                                    >
                                        <Td emphasis="strong">
                                            <span className="numeric">
                                                {row.position}
                                            </span>
                                        </Td>
                                        <Td emphasis="strong">
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
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.played)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.won)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.lost)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.drawn)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.goalsFor)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatNumber(row.goalsAgainst)}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <span className="numeric">
                                                {formatPercent(row.percentage)}
                                            </span>
                                        </Td>
                                        <Td
                                            align="right"
                                            emphasis="strong"
                                        >
                                            <span className="numeric">
                                                {formatNumber(row.points)}
                                            </span>
                                        </Td>
                                    </Tr>
                                ))}
                            </tbody>
                        </Table>
                    </TableFrame>
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
