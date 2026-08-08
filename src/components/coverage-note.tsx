import type { JSX } from 'react';
import type { Coverage } from '@/data/types';

const STATUS_LABEL: Record<string, string> = {
    ranked: 'ranked',
    'in-progress': 'in progress',
    absent: 'no season',
};

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
    return (
        <section
            aria-labelledby="coverage-heading"
            className="rounded-card border border-rule bg-paper-raised p-6 sm:p-8"
        >
            <h2
                id="coverage-heading"
                className="label-mono"
            >
                {'WHAT THIS COVERS'}
            </h2>
            <p className="mt-4 max-w-[64ch] leading-relaxed text-ink-body">
                {`Rankings are built from ${String(coverage.rankedYears.length)} completed seasons, ${String(coverage.rankedYears[0])} to ${String(coverage.rankedYears.at(-1))}. Anything earlier is not in the dataset yet.`}
            </p>
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
                                    title={season.note ?? undefined}
                                    className={`numeric rounded-full px-2.5 py-1 text-xs ${
                                        season.status === 'ranked'
                                            ? 'bg-paper-sunken text-ink'
                                            : 'bg-paper text-ink-muted ring-1 ring-rule'
                                    }`}
                                >
                                    {`${String(season.year)} · ${STATUS_LABEL[season.status] ?? season.status}`}
                                </span>
                            ))}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
