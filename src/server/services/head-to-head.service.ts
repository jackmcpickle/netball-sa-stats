/**
 * Serves `/head-to-head`. Everything the page shows is derived from one pair
 * fetch: the record, the roll-ups, the meetings, and the band picker's
 * options. Bands come from the fetched facts rather than a second query, so
 * the picker can only ever offer a tier the two clubs have actually met in.
 *
 * This is the one table on the site that is NOT paged in SQL, and that is
 * deliberate. The W-L-D record has to be computed over every meeting — a
 * record reflecting "page 1 of 3" would simply be wrong — so the full pair
 * fetch happens regardless, and paging the meetings in SQL would be a second
 * query on top of it rather than instead of it. Avoiding the full fetch would
 * mean reimplementing the record, `bySeason` and `byBand` as SQL aggregates,
 * which would duplicate the forfeit rule (results count, goals do not) in
 * three more places and hollow out the tested pure aggregator.
 *
 * Measured on the current dataset (5,508 games, 2025-2026): the busiest pair
 * is 195 rows, against 94 for the largest single grade. Revisit if fixtures
 * are ever backfilled past 2025 — a full-history pair could reach a few
 * thousand rows, at which point SQL aggregates start to earn their keep.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { bandLabel } from '@/pipeline/scoring/bands';
import type { Repos } from '@/server/container';
import { partitionClubs } from '@/server/domain/club-directory';
import {
    buildHeadToHead,
    MEETINGS_TABLE_SPEC,
    sortMeetings,
} from '@/server/domain/head-to-head';
import type { DomainError, Result } from '@/server/domain/result';
import { ok } from '@/server/domain/result';
import { TableQuery } from '@/server/domain/table-query';
import type {
    BandFilter,
    BandOption,
    GameFact,
    HeadToHeadPageDto,
    HeadToHeadParams,
} from '@/server/dto/head-to-head.dto';
import type { Club } from '@/server/dto/shared.dto';

function bandsFrom(facts: readonly GameFact[]): readonly BandOption[] {
    return [...new Set(facts.map((fact) => fact.tier))]
        .toSorted((left, right) => left - right)
        .map((tier) => ({ label: bandLabel(tier), tier }));
}

function findClub(
    clubs: readonly Club[],
    key: string | undefined,
): Club | null {
    if (isUndefined(key)) {
        return null;
    }
    return clubs.find((club) => club.key === key) ?? null;
}

/**
 * The picker offers present clubs (or all, with the toggle on) plus whichever
 * of A/B is already selected. Without that addition, a shared link naming a
 * defunct club would silently drop its own selection on load.
 */
function visibleClubs(
    all: readonly Club[],
    present: readonly Club[],
    includePast: boolean,
    selected: readonly (Club | null)[],
): readonly Club[] {
    if (includePast) {
        return all;
    }
    const keys = new Set(present.map((club) => club.key));
    const extra = selected.filter(
        (club): club is Club => !isNull(club) && !keys.has(club.key),
    );
    return extra.length === 0
        ? present
        : [...present, ...extra].toSorted((left, right) =>
              left.name.localeCompare(right.name),
          );
}

export interface HeadToHeadService {
    readonly getPage: (
        params: HeadToHeadParams,
    ) => Promise<Result<HeadToHeadPageDto, DomainError>>;
}

export function createHeadToHeadService(repos: Repos): HeadToHeadService {
    return {
        async getPage(
            params: HeadToHeadParams,
        ): Promise<Result<HeadToHeadPageDto, DomainError>> {
            const includePast = params.includePast ?? false;
            const [allClubs, history, coverage] = await Promise.all([
                repos.clubs.all(),
                repos.championship.history(),
                repos.seasons.coverage(),
            ]);
            // A dataset with no ranked season yet has no way to tell present
            // from past, so every club stays offered rather than none.
            const latest = coverage.latestRankedYear();
            const rankedKeys = new Set(
                (latest.ok
                    ? (history.find((entry) => entry.year === latest.value)
                          ?.rows ?? [])
                    : []
                ).map((row) => row.club.key),
            );
            const { present } = latest.ok
                ? partitionClubs(allClubs, rankedKeys)
                : { present: allClubs };

            const a = findClub(allClubs, params.a);
            const b = findClub(allClubs, params.b);
            const clubs = visibleClubs(allClubs, present, includePast, [a, b]);

            if (isNull(a) || isNull(b) || a.key === b.key) {
                return ok({
                    a,
                    b,
                    band: 'all',
                    bands: [],
                    clubs,
                    h2h: null,
                    includePast,
                    meetings: null,
                });
            }

            const facts = await repos.games.factsForPair(a.key, b.key);
            const bands = bandsFrom(facts);
            // An unknown or now-empty band silently falls back rather than
            // rendering a record the picker cannot represent.
            const band: BandFilter =
                bands.find((option) => option.tier === params.band)?.tier ??
                'all';

            const h2h = buildHeadToHead(facts, a.key, b.key, band);
            const paged = TableQuery.from(
                {
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                    sort: params.sort,
                },
                MEETINGS_TABLE_SPEC,
            ).apply(h2h.meetings, sortMeetings);

            return ok({
                a,
                b,
                band,
                bands,
                clubs,
                h2h,
                includePast,
                meetings: {
                    rows: paged.rows,
                    tableState: paged.state,
                    totalRows: paged.totalRows,
                },
            });
        },
    };
}
