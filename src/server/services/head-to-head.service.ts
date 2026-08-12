/**
 * Serves `/head-to-head`. Everything the page shows is derived from one pair
 * fetch: the record, the roll-ups, the meetings, and the band picker's
 * options. Bands come from the fetched facts rather than a second query, so
 * the picker can only ever offer a tier the two clubs have actually met in.
 */
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
        .sort((left, right) => left - right)
        .map((tier) => ({ tier, label: bandLabel(tier) }));
}

function findClub(
    clubs: readonly Club[],
    key: string | undefined,
): Club | null {
    if (key === undefined) {
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
        (club): club is Club => club !== null && !keys.has(club.key),
    );
    return extra.length === 0
        ? present
        : [...present, ...extra].sort((left, right) =>
              left.name.localeCompare(right.name),
          );
}

export function createHeadToHeadService(repos: Repos): {
    getPage(
        params: HeadToHeadParams,
    ): Promise<Result<HeadToHeadPageDto, DomainError>>;
} {
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

            if (a === null || b === null || a.key === b.key) {
                return ok({
                    clubs,
                    includePast,
                    a,
                    b,
                    band: 'all',
                    bands: [],
                    h2h: null,
                    meetings: null,
                });
            }

            const facts = await repos.games.factsForPair(a.key, b.key);
            const bands = bandsFrom(facts);
            // An unknown or now-empty band silently falls back rather than
            // rendering a record the picker cannot represent.
            const band: BandFilter = bands.some(
                (option) => option.tier === params.band,
            )
                ? (params.band as number)
                : 'all';

            const h2h = buildHeadToHead(facts, a.key, b.key, band);
            const paged = TableQuery.from(
                {
                    sort: params.sort,
                    dir: params.dir,
                    page: params.page,
                    pageSize: params.pageSize,
                },
                MEETINGS_TABLE_SPEC,
            ).apply(h2h.meetings, sortMeetings);

            return ok({
                clubs,
                includePast,
                a,
                b,
                band,
                bands,
                h2h,
                meetings: {
                    rows: paged.rows,
                    totalRows: paged.totalRows,
                    tableState: paged.state,
                },
            });
        },
    };
}
