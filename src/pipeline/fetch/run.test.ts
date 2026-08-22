import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isNull } from 'es-toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '@/pipeline/fetch/capture-store';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import { flattenStandings } from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';
import {
    AMND_ORG_ID,
    CITY_NIGHT_ORG_ID,
    ELIZABETH_ORG_ID,
    NETBALL_SA_ORG_ID,
    SAMMNA_ORG_ID,
    SAUCNA_ORG_ID,
    SUNA_ORG_ID,
    associationCollectOrgIds,
    archiveRowsToKeep,
    associationSeasonWanted,
    collectJobsFor,
    collectPlayHqData,
    isCataloguedPlayHqCompetition,
    processGrade,
    resolveCompetitionKey,
    seasonWanted,
} from '@/pipeline/fetch/run';
import type { GradeContext } from '@/pipeline/fetch/run';
import type { GradeLadderResponse } from '@/pipeline/fetch/types';

const ladderFixturePath = resolve(
    import.meta.dirname,
    '../../../data/raw/probe/gradeLadder_premier_2023_3c7d2b13.json',
);

function loadStandings(): readonly Standing[] {
    // SAFETY: this repo's own committed PlayHQ probe capture, the recorded
    // `gradeLadder` response; the asserted shape is the same one `collect.ts`
    // reads that capture back as, and `discoverGrade` is null-checked below.
    const response = JSON.parse(
        readFileSync(ladderFixturePath, 'utf-8'),
    ) as GradeLadderResponse;
    const { discoverGrade } = response.data;
    if (isNull(discoverGrade)) {
        throw new Error('fixture has no discoverGrade');
    }
    return flattenStandings(discoverGrade.ladder);
}

function baseCtx(
    isFinalBySeasonKey: ReadonlyMap<string, string>,
): GradeContext {
    return {
        isFinalBySeasonKey,
        orgId: NETBALL_SA_ORG_ID,
        period: 'annual',
        seasonName: 'Premier League 2023',
        seasonPlayhqId: 'season-2023-id',
        seasonStatus: 'in_progress',
        startYear: 2023,
    };
}

describe(resolveCompetitionKey, () => {
    it('maps any AMND grade to the amnd competition', () => {
        expect(resolveCompetitionKey(AMND_ORG_ID, 'A GRADE')).toBe('amnd');
        expect(resolveCompetitionKey(AMND_ORG_ID, 'Whatever Name')).toBe(
            'amnd',
        );
    });

    it('maps Netball SA Premier/Reserves Division, case-insensitively', () => {
        expect(
            resolveCompetitionKey(NETBALL_SA_ORG_ID, 'Premier Division'),
        ).toBe('premier_league');
        expect(
            resolveCompetitionKey(NETBALL_SA_ORG_ID, 'RESERVES DIVISION'),
        ).toBe('premier_league_reserves');
    });

    it('returns null for a Netball SA grade outside the catalogued competitions', () => {
        expect(
            resolveCompetitionKey(NETBALL_SA_ORG_ID, 'Walking Netball 50+'),
        ).toBeNull();
    });

    it('maps a verified SA association winter competition to its catalogue key', () => {
        expect(
            resolveCompetitionKey(SAUCNA_ORG_ID, 'A1', 'SAUCNA Winter'),
        ).toBe('saucna');
        expect(
            resolveCompetitionKey(SUNA_ORG_ID, 'Seniors Div 01', 'SUNA Winter'),
        ).toBe('suna');
        expect(
            resolveCompetitionKey(
                ELIZABETH_ORG_ID,
                'A1',
                'Elizabeth Netball Association',
            ),
        ).toBe('elizabeth');
        expect(
            resolveCompetitionKey(
                CITY_NIGHT_ORG_ID,
                'A1 Grade',
                'City Night Division 1',
            ),
        ).toBe('city_night_division');
        expect(
            resolveCompetitionKey(
                SAMMNA_ORG_ID,
                'M-League - Mens Division',
                'M League',
            ),
        ).toBe('sammna');
    });

    it('returns null for carnival or summer entries on those orgs', () => {
        expect(
            resolveCompetitionKey(SAUCNA_ORG_ID, '8U/1', 'Junior Carnival'),
        ).toBeNull();
        expect(
            resolveCompetitionKey(
                SUNA_ORG_ID,
                '9&U Div 1',
                'Schools Competition',
            ),
        ).toBeNull();
        expect(
            resolveCompetitionKey(
                ELIZABETH_ORG_ID,
                'A1',
                'ENA "Brenda Herraman" Carnival',
            ),
        ).toBeNull();
        expect(
            resolveCompetitionKey(
                SAMMNA_ORG_ID,
                'M-League - Mens Division',
                'SAMMNA Super League',
            ),
        ).toBeNull();
        expect(
            resolveCompetitionKey(SUNA_ORG_ID, '9&U Div 1', 'Junior Carnival'),
        ).toBeNull();
    });

    it('returns null for an association org when the PlayHQ competition name is missing', () => {
        expect(resolveCompetitionKey(SAUCNA_ORG_ID, 'A1')).toBeNull();
    });
});

describe(isCataloguedPlayHqCompetition, () => {
    it('keeps AMND and Netball SA seasons in scope', () => {
        expect(
            isCataloguedPlayHqCompetition(AMND_ORG_ID, 'AMND Competition'),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(
                NETBALL_SA_ORG_ID,
                'The Hospital Research Foundation Premier League',
            ),
        ).toBeTruthy();
    });

    it('keeps only the winter home-and-away entry for each new association', () => {
        expect(
            isCataloguedPlayHqCompetition(SAUCNA_ORG_ID, 'SAUCNA Winter'),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(SAUCNA_ORG_ID, 'Junior Carnival'),
        ).toBeFalsy();
        expect(
            isCataloguedPlayHqCompetition(SUNA_ORG_ID, 'SUNA Winter'),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(SUNA_ORG_ID, 'SUNA Summer'),
        ).toBeFalsy();
        expect(
            isCataloguedPlayHqCompetition(
                ELIZABETH_ORG_ID,
                'Elizabeth Netball Association',
            ),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(
                CITY_NIGHT_ORG_ID,
                'City Night Division 1',
            ),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(SAMMNA_ORG_ID, 'M League'),
        ).toBeTruthy();
        expect(
            isCataloguedPlayHqCompetition(SAMMNA_ORG_ID, 'SAMMNA Super League'),
        ).toBeFalsy();
    });
});

describe(associationSeasonWanted, () => {
    it('keeps only winter seasons when Elizabeth or SAMMNA share a competition object', () => {
        expect(
            associationSeasonWanted(ELIZABETH_ORG_ID, 'Winter 2025'),
        ).toBeTruthy();
        expect(
            associationSeasonWanted(ELIZABETH_ORG_ID, 'Summer 2024/25'),
        ).toBeFalsy();
        expect(
            associationSeasonWanted(SAMMNA_ORG_ID, 'Winter 2025'),
        ).toBeTruthy();
        expect(
            associationSeasonWanted(SAMMNA_ORG_ID, 'Summer 2024/25'),
        ).toBeFalsy();
    });

    it('keeps only summer seasons for City Night 2023+', () => {
        expect(
            associationSeasonWanted(CITY_NIGHT_ORG_ID, 'Summer 2024/25'),
        ).toBeTruthy();
        expect(
            associationSeasonWanted(CITY_NIGHT_ORG_ID, 'Winter 2021'),
        ).toBeFalsy();
    });

    it('does not filter SAUCNA seasons — winter is already its own competition', () => {
        expect(
            associationSeasonWanted(SAUCNA_ORG_ID, 'Winter 2025'),
        ).toBeTruthy();
        expect(
            associationSeasonWanted(AMND_ORG_ID, 'Winter 2024'),
        ).toBeTruthy();
    });
});

describe(collectJobsFor, () => {
    it('walks AMND, Netball SA and every verified association org from 2023', () => {
        const orgIds = collectJobsFor().map((job) => job.orgId);
        expect(orgIds.slice(0, 2)).toStrictEqual([
            AMND_ORG_ID,
            NETBALL_SA_ORG_ID,
        ]);
        expect(orgIds).toContain(SAUCNA_ORG_ID);
        expect(orgIds).not.toContain('b0bbe786');
        expect(orgIds).not.toContain('cd26c84e');
        expect(orgIds).not.toContain('489c7576');
        expect(
            collectJobsFor()
                .slice(2)
                .every((job) => job.minYear === 2023),
        ).toBeTruthy();
    });

    it('starts new association jobs at 2023', () => {
        expect(
            collectJobsFor([SAUCNA_ORG_ID, CITY_NIGHT_ORG_ID]),
        ).toStrictEqual([
            { minYear: 2023, orgId: SAUCNA_ORG_ID, period: 'winter' },
            { minYear: 2023, orgId: CITY_NIGHT_ORG_ID, period: 'summer' },
        ]);
    });

    it('can target one hardcoded association org', () => {
        expect(collectJobsFor([SAUCNA_ORG_ID])).toStrictEqual([
            { minYear: 2023, orgId: SAUCNA_ORG_ID, period: 'winter' },
        ]);
    });

    it('fails loud on an org id that is not in COLLECT_JOBS', () => {
        expect(() => collectJobsFor(['deadbeef'])).toThrow(/deadbeef/u);
    });
});

/** The slice of a PlayHQ season entry `seasonWanted` actually reads. */
interface SeasonProbe {
    startDate: string;
    status: { value: string };
}

function seasonProbe(startDate: string, status: string): SeasonProbe {
    return { startDate, status: { value: status } };
}

describe(seasonWanted, () => {
    it('keeps only active seasons when no years are requested', () => {
        expect(
            seasonWanted(seasonProbe('2026-04-01', 'ACTIVE'), undefined),
        ).toBeTruthy();
        expect(
            seasonWanted(seasonProbe('2024-04-01', 'COMPLETED'), undefined),
        ).toBeFalsy();
    });

    it('keeps a requested year regardless of status', () => {
        expect(
            seasonWanted(seasonProbe('2024-04-01', 'COMPLETED'), [2024]),
        ).toBeTruthy();
        expect(
            seasonWanted(seasonProbe('2025-04-01', 'ACTIVE'), [2024]),
        ).toBeFalsy();
    });

    it('treats an empty year list as the CLI full walk, status ignored', () => {
        expect(
            seasonWanted(seasonProbe('2024-04-01', 'COMPLETED'), []),
        ).toBeTruthy();
    });
});

describe('processGrade curation safety: seasons.is_final', () => {
    const standings = loadStandings();
    const grade = { age: null, id: 'grade-id', name: 'Premier Division' };

    it('preserves an existing curated is_final=1 on re-merge', () => {
        const registry = new ClubRegistry([], []);
        const isFinalBySeasonKey = new Map([
            ['premier_league-annual-2023', '1'],
        ]);
        const result = processGrade(
            grade,
            standings,
            baseCtx(isFinalBySeasonKey),
            registry,
            1000,
        );
        expect(result?.seasonRow.is_final).toBe(1);
    });

    it('preserves an existing curated is_final=0 (does not flip it based on PlayHQ status)', () => {
        const registry = new ClubRegistry([], []);
        const isFinalBySeasonKey = new Map([
            ['premier_league-annual-2023', '0'],
        ]);
        const result = processGrade(
            grade,
            standings,
            baseCtx(isFinalBySeasonKey),
            registry,
            1000,
        );
        expect(result?.seasonRow.is_final).toBe(0);
    });

    it('defaults a genuinely new season row to is_final=0', () => {
        const registry = new ClubRegistry([], []);
        const result = processGrade(
            grade,
            standings,
            baseCtx(new Map()),
            registry,
            1000,
        );
        expect(result?.seasonRow.is_final).toBe(0);
    });

    it('still records PlayHQ status informationally, independent of is_final', () => {
        const registry = new ClubRegistry([], []);
        const isFinalBySeasonKey = new Map([
            ['premier_league-annual-2023', '1'],
        ]);
        const ctx = baseCtx(isFinalBySeasonKey);
        const result = processGrade(grade, standings, ctx, registry, 1000);
        expect(result?.seasonRow.status).toBe('in_progress');
        expect(result?.seasonRow.is_final).toBe(1);
    });
});

function makeStanding(overrides: {
    teamId: string;
    teamName: string;
    orgId: string;
    orgName: string;
}): Standing {
    return {
        byes: 0,
        competitionPoints: 10,
        drawn: 0,
        forfeits: 0,
        lost: 5,
        percentage: 100,
        played: 10,
        pointsAgainst: 100,
        pointsDifference: 0,
        pointsFor: 100,
        team: {
            id: overrides.teamId,
            name: overrides.teamName,
            organisation: {
                id: overrides.orgId,
                name: overrides.orgName,
                type: 'club',
            },
        },
        won: 5,
    };
}

describe('team identity: playhq_id, not synthetic squad_number index', () => {
    const grade = { age: null, id: 'grade-id', name: 'A GRADE' };
    const ctx: GradeContext = {
        ...baseCtx(new Map()),
        orgId: AMND_ORG_ID,
        period: 'winter',
    };

    it('a colour-named collision group (no numeric suffix) keeps both teams, squad_number null for both', () => {
        const registry = new ClubRegistry([], []);
        const standings = [
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
            }),
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-orange',
                teamName: 'City Coasters Orange',
            }),
        ];
        const result = processGrade(grade, standings, ctx, registry, 1000);
        expect(result?.teams).toHaveLength(2);
        expect(result?.results).toHaveLength(2);
        const byName = new Map(
            result?.teams.map((t) => [t.row.display_name, t.row]),
        );
        expect(byName.get('City Coasters Purple')?.squad_number).toBeNull();
        expect(byName.get('City Coasters Orange')?.squad_number).toBeNull();
        expect(byName.get('City Coasters Purple')?.playhq_id).toBe(
            'team-purple',
        );
        expect(byName.get('City Coasters Orange')?.playhq_id).toBe(
            'team-orange',
        );
    });

    it('a surviving team keeps its identity (playhq_id) when a teammate is added or removed between runs', () => {
        // Run 1: two unnumbered teams in the collision group.
        const registryRun1 = new ClubRegistry([], []);
        const standingsRun1 = [
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
            }),
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-orange',
                teamName: 'City Coasters Orange',
            }),
        ];
        const run1 = processGrade(
            grade,
            standingsRun1,
            ctx,
            registryRun1,
            1000,
        );
        const purpleRun1 = run1?.teams.find(
            (t) => t.row.display_name === 'City Coasters Purple',
        );

        // Run 2: "Orange" drops out, a brand new "Green" team joins instead.
        // A positional/index-based identity scheme would reassign Purple's
        // synthetic squad_number here; playhq_id must not move.
        const registryRun2 = new ClubRegistry([], []);
        const standingsRun2 = [
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
            }),
            makeStanding({
                orgId: 'org-1',
                orgName: 'City Coasters',
                teamId: 'team-green',
                teamName: 'City Coasters Green',
            }),
        ];
        const run2 = processGrade(
            grade,
            standingsRun2,
            ctx,
            registryRun2,
            1000,
        );
        const purpleRun2 = run2?.teams.find(
            (t) => t.row.display_name === 'City Coasters Purple',
        );

        expect(purpleRun1?.row.playhq_id).toBe('team-purple');
        expect(purpleRun2?.row.playhq_id).toBe('team-purple');
        expect(purpleRun1?.key).toBe(purpleRun2?.key);
        expect(purpleRun1?.row.squad_number).toBeNull();
        expect(purpleRun2?.row.squad_number).toBeNull();
    });

    it('genuine numeric-suffix teams still resolve to real squad_number values', () => {
        const registry = new ClubRegistry([], []);
        const standings = [
            makeStanding({
                orgId: 'org-2',
                orgName: 'Walkerville',
                teamId: 'team-walkerville-1',
                teamName: 'Walkerville 1',
            }),
            makeStanding({
                orgId: 'org-2',
                orgName: 'Walkerville',
                teamId: 'team-walkerville-2',
                teamName: 'Walkerville 2',
            }),
        ];
        const result = processGrade(grade, standings, ctx, registry, 1000);
        const byName = new Map(
            result?.teams.map((t) => [t.row.display_name, t.row]),
        );
        expect(byName.get('Walkerville 1')?.squad_number).toBe(1);
        expect(byName.get('Walkerville 2')?.squad_number).toBe(2);
        expect(byName.get('Walkerville 1')?.playhq_id).toBe(
            'team-walkerville-1',
        );
        expect(byName.get('Walkerville 2')?.playhq_id).toBe(
            'team-walkerville-2',
        );
    });
});

describe(archiveRowsToKeep, () => {
    // The PlayHQ walk only ever sees PlayHQ seasons, but it rewrites the same
    // CSVs the archive-PDF pipeline writes into. Without this, one `--games`
    // run silently deletes 16 seasons of 2000-2016 history.
    const existing = {
        grades: [
            { grade_key: 'a-2005', season_key: 'amnd-winter-2005' },
            { grade_key: 'a-2025', season_key: 'amnd-winter-2025' },
        ],
        results: [
            { grade_key: 'a-2005', source: 'archive_pdf' },
            { grade_key: 'a-2025', source: 'playhq' },
        ],
        seasons: [
            {
                season_key: 'amnd-winter-2005',
                source: 'archive_pdf',
            },
            {
                season_key: 'amnd-winter-2025',
                source: 'playhq',
            },
        ],
        teams: [
            { grade_key: 'a-2005', playhq_id: '' },
            { grade_key: 'a-2025', playhq_id: 'p1' },
        ],
    };

    it('keeps archive seasons and drops playhq ones', () => {
        const kept = archiveRowsToKeep(existing);
        expect(kept.seasons.map((row) => row.season_key)).toStrictEqual([
            'amnd-winter-2005',
        ]);
    });

    it('keeps grades belonging to an archive season', () => {
        const kept = archiveRowsToKeep(existing);
        expect(kept.grades.map((row) => row.grade_key)).toStrictEqual([
            'a-2005',
        ]);
    });

    it('keeps teams belonging to an archive grade', () => {
        // teams.csv has no source column, so archive-ness is inherited
        // through grade -> season.
        const kept = archiveRowsToKeep(existing);
        expect(kept.teams).toHaveLength(1);
        expect(kept.teams[0].grade_key).toBe('a-2005');
    });

    it('keeps archive results and drops playhq ones', () => {
        const kept = archiveRowsToKeep(existing);
        expect(kept.results).toHaveLength(1);
        expect(kept.results[0].source).toBe('archive_pdf');
    });

    it('keeps nothing when there is no archive data at all', () => {
        const kept = archiveRowsToKeep({
            grades: [{ grade_key: 'g', season_key: 'a' }],
            results: [{ grade_key: 'g', source: 'playhq' }],
            seasons: [{ season_key: 'a', source: 'playhq' }],
            teams: [{ grade_key: 'g', playhq_id: 'p' }],
        });
        expect(kept.seasons).toStrictEqual([]);
        expect(kept.grades).toStrictEqual([]);
        expect(kept.teams).toStrictEqual([]);
        expect(kept.results).toStrictEqual([]);
    });

    it('still drops playhq seasons that this run fetched', () => {
        const kept = archiveRowsToKeep(existing, new Set(['amnd-winter-2025']));
        expect(kept.seasons.map((row) => row.season_key)).toStrictEqual([
            'amnd-winter-2005',
        ]);
        expect(kept.grades.map((row) => row.grade_key)).toStrictEqual([
            'a-2005',
        ]);
        expect(kept.results.map((row) => row.source)).toStrictEqual([
            'archive_pdf',
        ]);
    });

    it('keeps playhq seasons this run did not fetch, plus archive rows', () => {
        // `--year=2026` only accumulates 2026; writeCsvs must not wipe 2025.
        const yearFiltered = {
            grades: [
                ...existing.grades,
                { grade_key: 'a-2026', season_key: 'amnd-winter-2026' },
            ],
            results: [
                ...existing.results,
                { grade_key: 'a-2026', source: 'playhq' },
            ],
            seasons: [
                ...existing.seasons,
                { season_key: 'amnd-winter-2026', source: 'playhq' },
            ],
            teams: [
                ...existing.teams,
                { grade_key: 'a-2026', playhq_id: 'p2' },
            ],
        };
        const kept = archiveRowsToKeep(
            yearFiltered,
            new Set(['amnd-winter-2026']),
        );
        expect(kept.seasons.map((row) => row.season_key)).toStrictEqual([
            'amnd-winter-2005',
            'amnd-winter-2025',
        ]);
        expect(kept.grades.map((row) => row.grade_key)).toStrictEqual([
            'a-2005',
            'a-2025',
        ]);
        expect(kept.teams.map((row) => row.grade_key)).toStrictEqual([
            'a-2005',
            'a-2025',
        ]);
        expect(kept.results.map((row) => row.grade_key)).toStrictEqual([
            'a-2005',
            'a-2025',
        ]);
    });
});

const CAPTURED_AT_MS = 1_700_000_000_000;

/** One `createMemoryStore` seed entry: a raw capture plus its fetch time. */
interface CaptureSeedEntry {
    data: unknown;
    capturedAtMs: number;
}

/**
 * A PlayHQ GraphQL response envelope. `data` stays `unknown` for the same
 * reason `CaptureStore.get` does — each collect step parses its own slice.
 */
interface CaptureEnvelope {
    data: unknown;
}

function seedEntry(data: unknown): CaptureSeedEntry {
    return { capturedAtMs: CAPTURED_AT_MS, data };
}

function discoverEnvelope(
    orgId: string,
    orgName: string,
    seasons: readonly {
        id: string;
        name: string;
        startDate: string;
        status?: string;
    }[],
): CaptureEnvelope {
    return {
        data: {
            discoverCompetitions: [
                {
                    id: 'comp',
                    name: orgName,
                    organisation: { id: orgId, name: orgName },
                    seasons: seasons.map((season) => ({
                        endDate: season.startDate,
                        id: season.id,
                        name: season.name,
                        startDate: season.startDate,
                        status: {
                            name: season.status ?? 'Completed',
                            value: (season.status ?? 'COMPLETED').toUpperCase(),
                        },
                    })),
                },
            ],
        },
    };
}

function seasonEnvelope(
    seasonId: string,
    seasonName: string,
    grades: readonly { id: string; name: string }[],
): CaptureEnvelope {
    return {
        data: {
            discoverSeason: {
                competition: {
                    id: 'c',
                    name: 'AMND',
                    organisation: { id: AMND_ORG_ID, name: 'AMND' },
                    type: 'COMPETITION',
                },
                grades: grades.map((grade) => ({
                    age: null,
                    day: null,
                    gender: null,
                    id: grade.id,
                    name: grade.name,
                })),
                id: seasonId,
                name: seasonName,
                status: { name: 'Completed', value: 'COMPLETED' },
            },
        },
    };
}

function ladderEnvelope(
    gradeId: string,
    gradeName: string,
    standings: readonly Standing[],
): CaptureEnvelope {
    return {
        data: {
            discoverGrade: {
                id: gradeId,
                ladder: [{ pool: null, standings }],
                ladderType: 'STANDARD',
                name: gradeName,
            },
        },
    };
}

function twoTeamStandings(): readonly Standing[] {
    return [
        makeStanding({
            orgId: 'org-a',
            orgName: 'Club A',
            teamId: 'team-a',
            teamName: 'Club A',
        }),
        makeStanding({
            orgId: 'org-b',
            orgName: 'Club B',
            teamId: 'team-b',
            teamName: 'Club B',
        }),
    ];
}

function gamesEnvelope(): CaptureEnvelope {
    return {
        data: {
            discoverGradeFixture: [
                {
                    abbreviatedName: 'R1',
                    byes: [],
                    games: [
                        {
                            alias: null,
                            allocation: { time: '18:00:00' },
                            away: { id: 'team-b', name: 'Club B' },
                            date: '2024-05-01',
                            dates: ['2024-05-01'],
                            home: { id: 'team-a', name: 'Club A' },
                            id: 'game-1',
                            pool: null,
                            result: {
                                away: {
                                    gameOutcomeDescription: '',
                                    outcome: {
                                        name: 'Loss',
                                        value: 'LOSS',
                                    },
                                    statistics: [
                                        {
                                            count: 30,
                                            type: { value: 'TOTAL_SCORE' },
                                        },
                                    ],
                                },
                                home: {
                                    gameOutcomeDescription: '',
                                    outcome: {
                                        name: 'Win',
                                        value: 'WIN',
                                    },
                                    statistics: [
                                        {
                                            count: 40,
                                            type: { value: 'TOTAL_SCORE' },
                                        },
                                    ],
                                },
                                outcome: {
                                    name: 'Home won',
                                    value: 'HOME_TEAM_WON_BY_SCORE',
                                },
                                winner: { name: 'Home', value: 'HOME' },
                            },
                            status: { name: 'Final', value: 'FINAL' },
                        },
                    ],
                    id: 'round-1',
                    isFinalsRound: false,
                    name: 'Round 1',
                    number: 1,
                },
            ],
        },
    };
}

/** Empty `discoverCompetitions` captures so default COLLECT_JOBS stay offline. */
function emptyAssociationDiscovers(): [string, ReturnType<typeof seedEntry>][] {
    return associationCollectOrgIds().map((orgId) => [
        `discoverCompetitions_${orgId}.json`,
        seedEntry({ data: { discoverCompetitions: [] } }),
    ]);
}

describe(collectPlayHqData, () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('collects ImportData from a memory store without hitting PlayHQ or writing CSV', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => {
                throw new Error('live PlayHQ must not be called');
            });
        const store = createMemoryStore(
            new Map([
                [
                    `discoverCompetitions_${AMND_ORG_ID}.json`,
                    seedEntry(
                        discoverEnvelope(AMND_ORG_ID, 'AMND', [
                            {
                                id: 'season-2024',
                                name: 'Winter 2024',
                                startDate: '2024-04-01',
                                status: 'active',
                            },
                        ]),
                    ),
                ],
                [
                    `discoverCompetitions_${NETBALL_SA_ORG_ID}.json`,
                    seedEntry({ data: { discoverCompetitions: [] } }),
                ],
                ...emptyAssociationDiscovers(),
                [
                    'gradeListDiscoverSeason_season-2024.json',
                    seedEntry(
                        seasonEnvelope('season-2024', 'Winter 2024', [
                            { id: 'grade-a', name: 'A GRADE' },
                        ]),
                    ),
                ],
                [
                    'gradeLadder_grade-a.json',
                    seedEntry(
                        ladderEnvelope(
                            'grade-a',
                            'A GRADE',
                            twoTeamStandings(),
                        ),
                    ),
                ],
            ]),
        );

        const collected = await collectPlayHqData({
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
            store,
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(collected.importData.seasons).toHaveLength(1);
        expect(collected.importData.seasons[0]).toMatchObject({
            isFinal: false,
            playhqId: 'season-2024',
            seasonKey: 'amnd-winter-2024',
            source: 'playhq',
        });
        expect(collected.importData.grades).toHaveLength(1);
        expect(collected.importData.teams).toHaveLength(2);
        expect(collected.importData.results).toHaveLength(2);
        expect(collected.importData.games).toStrictEqual([]);
        expect(collected.report).toMatchObject({
            games: 0,
            grades: 1,
            results: 2,
            seasons: 1,
            teams: 2,
        });
        expect(collected.seasons[0]?.status).toBe('active');
    });

    it('collects a targeted association winter season and does not walk its carnival', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => {
                throw new Error('live PlayHQ must not be called');
            });
        const store = createMemoryStore(
            new Map([
                [
                    `discoverCompetitions_${SAUCNA_ORG_ID}.json`,
                    seedEntry({
                        data: {
                            discoverCompetitions: [
                                {
                                    id: 'saucna-winter',
                                    name: 'SAUCNA Winter',
                                    organisation: {
                                        id: SAUCNA_ORG_ID,
                                        name: 'SAUCNA',
                                    },
                                    seasons: [
                                        {
                                            endDate: '2024-03-23',
                                            id: 'saucna-2024',
                                            name: 'Winter 2024',
                                            startDate: '2024-03-23',
                                            status: {
                                                name: 'Completed',
                                                value: 'COMPLETED',
                                            },
                                        },
                                    ],
                                },
                                {
                                    id: 'saucna-carnival',
                                    name: 'Junior Carnival',
                                    organisation: {
                                        id: SAUCNA_ORG_ID,
                                        name: 'SAUCNA',
                                    },
                                    seasons: [
                                        {
                                            endDate: '2024-07-16',
                                            id: 'carnival-2024',
                                            name: 'Winter 2024',
                                            startDate: '2024-07-16',
                                            status: {
                                                name: 'Completed',
                                                value: 'COMPLETED',
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    }),
                ],
                [
                    'gradeListDiscoverSeason_saucna-2024.json',
                    seedEntry(
                        seasonEnvelope('saucna-2024', 'Winter 2024', [
                            { id: 'grade-a1', name: 'A1' },
                        ]),
                    ),
                ],
                [
                    'gradeLadder_grade-a1.json',
                    seedEntry(
                        ladderEnvelope('grade-a1', 'A1', twoTeamStandings()),
                    ),
                ],
            ]),
        );

        const collected = await collectPlayHqData({
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
            orgIds: [SAUCNA_ORG_ID],
            store,
            years: [2024],
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(collected.seasons).toHaveLength(1);
        expect(collected.seasons[0]).toMatchObject({
            competition_key: 'saucna',
            season_key: 'saucna-winter-2024',
        });
        expect(collected.grades[0]?.name).toBe('A1');
        expect(collected.grades[0]?.tier).toBe(1);
    });

    it('never requests a completed season when years is omitted', async () => {
        // The scheduled import passes no years. Only the season list is in
        // the store: reaching a completed season's grades would mean a live
        // PlayHQ request, which the spy turns into a failure.
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('live PlayHQ must not be called');
        });
        const store = createMemoryStore(
            new Map([
                [
                    `discoverCompetitions_${AMND_ORG_ID}.json`,
                    seedEntry(
                        discoverEnvelope(AMND_ORG_ID, 'AMND', [
                            {
                                id: 'season-2024',
                                name: 'Winter 2024',
                                startDate: '2024-04-01',
                            },
                        ]),
                    ),
                ],
                [
                    `discoverCompetitions_${NETBALL_SA_ORG_ID}.json`,
                    seedEntry({ data: { discoverCompetitions: [] } }),
                ],
                ...emptyAssociationDiscovers(),
            ]),
        );

        const collected = await collectPlayHqData({
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
            store,
        });

        expect(collected.seasons).toStrictEqual([]);
        expect(collected.report.seasons).toBe(0);
    });

    it('filters seasons to years when years is non-empty', async () => {
        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => {
                throw new Error('live PlayHQ must not be called');
            });
        const store = createMemoryStore(
            new Map([
                [
                    `discoverCompetitions_${AMND_ORG_ID}.json`,
                    seedEntry(
                        discoverEnvelope(AMND_ORG_ID, 'AMND', [
                            {
                                id: 'season-2024',
                                name: 'Winter 2024',
                                startDate: '2024-04-01',
                            },
                            {
                                id: 'season-2025',
                                name: 'Winter 2025',
                                startDate: '2025-04-01',
                            },
                        ]),
                    ),
                ],
                [
                    `discoverCompetitions_${NETBALL_SA_ORG_ID}.json`,
                    seedEntry({ data: { discoverCompetitions: [] } }),
                ],
                ...emptyAssociationDiscovers(),
                [
                    'gradeListDiscoverSeason_season-2024.json',
                    seedEntry(
                        seasonEnvelope('season-2024', 'Winter 2024', [
                            { id: 'grade-a', name: 'A GRADE' },
                        ]),
                    ),
                ],
                [
                    'gradeLadder_grade-a.json',
                    seedEntry(
                        ladderEnvelope(
                            'grade-a',
                            'A GRADE',
                            twoTeamStandings(),
                        ),
                    ),
                ],
            ]),
        );

        const collected = await collectPlayHqData({
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
            store,
            years: [2024],
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(
            collected.importData.seasons.map((row) => row.seasonKey),
        ).toStrictEqual(['amnd-winter-2024']);
    });

    it('restricts games by gradeId while still collecting the grade ladder', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('live PlayHQ must not be called');
        });
        const store = createMemoryStore(
            new Map([
                [
                    `discoverCompetitions_${AMND_ORG_ID}.json`,
                    seedEntry(
                        discoverEnvelope(AMND_ORG_ID, 'AMND', [
                            {
                                id: 'season-2024',
                                name: 'Winter 2024',
                                startDate: '2024-04-01',
                                status: 'active',
                            },
                        ]),
                    ),
                ],
                [
                    `discoverCompetitions_${NETBALL_SA_ORG_ID}.json`,
                    seedEntry({ data: { discoverCompetitions: [] } }),
                ],
                ...emptyAssociationDiscovers(),
                [
                    'gradeListDiscoverSeason_season-2024.json',
                    seedEntry(
                        seasonEnvelope('season-2024', 'Winter 2024', [
                            { id: 'grade-a', name: 'A GRADE' },
                            { id: 'grade-b', name: 'B1' },
                        ]),
                    ),
                ],
                [
                    'gradeLadder_grade-a.json',
                    seedEntry(
                        ladderEnvelope(
                            'grade-a',
                            'A GRADE',
                            twoTeamStandings(),
                        ),
                    ),
                ],
                [
                    'gradeLadder_grade-b.json',
                    seedEntry(
                        ladderEnvelope(
                            'grade-b',
                            'B1',
                            twoTeamStandings().map((row, index) => ({
                                ...row,
                                team: {
                                    ...row.team,
                                    id: `${row.team.id}-b${String(index)}`,
                                },
                            })),
                        ),
                    ),
                ],
                ['gradeAllRounds_grade-a.json', seedEntry(gamesEnvelope())],
            ]),
        );

        const collected = await collectPlayHqData({
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            games: true,
            gradeId: 'grade-a',
            isFinalBySeasonKey: new Map(),
            store,
        });

        expect(collected.importData.grades).toHaveLength(2);
        expect(collected.importData.games).toHaveLength(1);
        expect(collected.importData.games[0]).toMatchObject({
            file: 'games-2024.csv',
            isFinals: false,
            playhqId: 'game-1',
        });
        expect(collected.report.games).toBe(1);
    });
});
