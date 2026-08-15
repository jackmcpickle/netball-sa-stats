import { isNil, isNull, isUndefined } from 'es-toolkit';
import type { JSX } from 'react';
import { gapLabel } from '@/components/charts/timeline-slots';
import type { Coverage } from '@/server/dto/shared.dto';

const STATUS_LABEL = new Map([
    ['ranked', 'ranked'],
    ['in-progress', 'in progress'],
    ['absent', 'no season'],
]);

/** Human wording for a season status, falling back to the raw key. */
function statusLabel(status: string): string {
    return STATUS_LABEL.get(status) ?? status;
}

/**
 * What the site actually covers, stated plainly rather than implied by an
 * empty cell. `no season` is a real-world fact (Premier League did not run in
 * 2022) and is styled the same as any other status, not as a gap.
 */
export function CoverageNote({
    coverage,
}: {
    readonly coverage: Coverage;
}): JSX.Element {
    const [first] = coverage.rankedYears;
    const last = coverage.rankedYears.at(-1);
    const gapText =
        coverage.timelineGaps.length === 0
            ? null
            : coverage.timelineGaps
                  .map((gap) => gapLabel(gap.missingYears))
                  .join('; ');

    return (
        <section
            aria-labelledby="coverage-heading"
            className="rounded-card border border-rule bg-paper-raised p-5 sm:p-8"
        >
            <h2
                id="coverage-heading"
                className="label-mono"
            >
                WHAT THIS COVERS
            </h2>
            <p className="mt-4 max-w-[64ch] leading-relaxed text-ink-body">
                {isUndefined(first) || isUndefined(last)
                    ? 'No completed seasons are ranked yet.'
                    : `Rankings span ${String(coverage.rankedYears.length)} completed seasons from ${String(first)} to ${String(last)}.`}
            </p>
            {!isNull(gapText) && (
                <p className="mt-3 max-w-[64ch] leading-relaxed text-ink-body">
                    {`No public ladder data was recovered for ${gapText}, so the timeline shows a break there rather than inventing continuity.`}
                </p>
            )}
            {coverage.methodologyBreak && (
                <p className="mt-3 max-w-[64ch] leading-relaxed text-ink-body">
                    {`Through ${String(coverage.methodologyBreak.afterYear)}, finishes come from AMND Final Premiership Placings PDFs (placement-only; top four may reflect finals). From ${String(coverage.methodologyBreak.beforeYear)} they come from PlayHQ regular-season ladders with full match stats. Championship points are scored across both eras, but movement arrows are suppressed across that break.`}
                </p>
            )}
            {coverage.changeNote && (
                <p className="mt-3 max-w-[64ch] leading-relaxed text-ink-body">
                    {`${coverage.changeNote.addedCompetitions.join(' and ')} ${coverage.changeNote.addedCompetitions.length === 1 ? 'enters' : 'enter'} the championship count from ${String(coverage.changeNote.year)}, so totals from before ${String(coverage.changeNote.year)} are not directly comparable to it — the club championship table does not show a movement arrow across that boundary.`}
                </p>
            )}
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {coverage.competitions.map((entry) => (
                    <div key={entry.competition.key}>
                        <dt className="text-sm font-semibold text-ink">
                            {entry.competition.name}
                        </dt>
                        <dd className="mt-2 flex flex-wrap gap-1.5">
                            {entry.seasons.map((season) => (
                                <span
                                    key={season.year}
                                    className={`numeric rounded-full px-2.5 py-1 text-xs ${
                                        season.status === 'ranked'
                                            ? 'bg-paper-sunken text-ink'
                                            : 'bg-paper text-ink-muted ring-1 ring-rule'
                                    }`}
                                >
                                    {`${String(season.year)} · ${statusLabel(season.status)}`}
                                    {isNil(season.note) ? null : (
                                        <span className="sr-only">
                                            {` — ${season.note}`}
                                        </span>
                                    )}
                                </span>
                            ))}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
