import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '@/pipeline/fetch/capture-store';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import { flattenStandings } from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';
import {
    archiveRowsToKeep,
    collectPlayHqData,
    processGrade,
    resolveCompetitionKey,
    seasonWanted,
} from '@/pipeline/fetch/run';
import type { GradeContext } from '@/pipeline/fetch/run';
import type { GradeLadderResponse } from '@/pipeline/fetch/types';

const AMND_ORG_ID = '7a5f35e1';
const NETBALL_SA_ORG_ID = '6fefc037';

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
    if (discoverGrade === null) {
        throw new Error('fixture has no discoverGrade');
    }
    return flattenStandings(discoverGrade.ladder);
}

function baseCtx(
    isFinalBySeasonKey: ReadonlyMap<string, string>,
): GradeContext {
    return {
        orgId: NETBALL_SA_ORG_ID,
        period: 'annual',
        startYear: 2023,
        seasonName: 'Premier League 2023',
        seasonPlayhqId: 'season-2023-id',
        seasonStatus: 'in_progress',
        isFinalBySeasonKey,
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
    const grade = { id: 'grade-id', name: 'Premier Division', age: null };

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
        team: {
            id: overrides.teamId,
            name: overrides.teamName,
            organisation: {
                id: overrides.orgId,
                name: overrides.orgName,
                type: 'club',
            },
        },
        played: 10,
        won: 5,
        lost: 5,
        drawn: 0,
        byes: 0,
        pointsFor: 100,
        pointsAgainst: 100,
        pointsDifference: 0,
        forfeits: 0,
        percentage: 100,
        competitionPoints: 10,
    };
}

describe('team identity: playhq_id, not synthetic squad_number index', () => {
    const grade = { id: 'grade-id', name: 'A GRADE', age: null };
    const ctx: GradeContext = {
        ...baseCtx(new Map()),
        orgId: AMND_ORG_ID,
        period: 'winter',
    };

    it('a colour-named collision group (no numeric suffix) keeps both teams, squad_number null for both', () => {
        const registry = new ClubRegistry([], []);
        const standings = [
            makeStanding({
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
                orgId: 'org-1',
                orgName: 'City Coasters',
            }),
            makeStanding({
                teamId: 'team-orange',
                teamName: 'City Coasters Orange',
                orgId: 'org-1',
                orgName: 'City Coasters',
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
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
                orgId: 'org-1',
                orgName: 'City Coasters',
            }),
            makeStanding({
                teamId: 'team-orange',
                teamName: 'City Coasters Orange',
                orgId: 'org-1',
                orgName: 'City Coasters',
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
                teamId: 'team-purple',
                teamName: 'City Coasters Purple',
                orgId: 'org-1',
                orgName: 'City Coasters',
            }),
            makeStanding({
                teamId: 'team-green',
                teamName: 'City Coasters Green',
                orgId: 'org-1',
                orgName: 'City Coasters',
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
                teamId: 'team-walkerville-1',
                teamName: 'Walkerville 1',
                orgId: 'org-2',
                orgName: 'Walkerville',
            }),
            makeStanding({
                teamId: 'team-walkerville-2',
                teamName: 'Walkerville 2',
                orgId: 'org-2',
                orgName: 'Walkerville',
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
        grades: [
            { season_key: 'amnd-winter-2005', grade_key: 'a-2005' },
            { season_key: 'amnd-winter-2025', grade_key: 'a-2025' },
        ],
        teams: [
            { grade_key: 'a-2005', playhq_id: '' },
            { grade_key: 'a-2025', playhq_id: 'p1' },
        ],
        results: [
            { grade_key: 'a-2005', source: 'archive_pdf' },
            { grade_key: 'a-2025', source: 'playhq' },
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
            seasons: [{ season_key: 'a', source: 'playhq' }],
            grades: [{ season_key: 'a', grade_key: 'g' }],
            teams: [{ grade_key: 'g', playhq_id: 'p' }],
            results: [{ grade_key: 'g', source: 'playhq' }],
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
            seasons: [
                ...existing.seasons,
                { season_key: 'amnd-winter-2026', source: 'playhq' },
            ],
            grades: [
                ...existing.grades,
                { season_key: 'amnd-winter-2026', grade_key: 'a-2026' },
            ],
            teams: [
                ...existing.teams,
                { grade_key: 'a-2026', playhq_id: 'p2' },
            ],
            results: [
                ...existing.results,
                { grade_key: 'a-2026', source: 'playhq' },
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
    return { data, capturedAtMs: CAPTURED_AT_MS };
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
                    seasons: seasons.map((season) => ({
                        id: season.id,
                        name: season.name,
                        startDate: season.startDate,
                        endDate: season.startDate,
                        status: {
                            name: season.status ?? 'Completed',
                            value: (season.status ?? 'COMPLETED').toUpperCase(),
                        },
                    })),
                    organisation: { id: orgId, name: orgName },
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
                id: seasonId,
                name: seasonName,
                competition: {
                    id: 'c',
                    name: 'AMND',
                    type: 'COMPETITION',
                    organisation: { id: AMND_ORG_ID, name: 'AMND' },
                },
                status: { name: 'Completed', value: 'COMPLETED' },
                grades: grades.map((grade) => ({
                    id: grade.id,
                    name: grade.name,
                    day: null,
                    gender: null,
                    age: null,
                })),
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
                name: gradeName,
                ladderType: 'STANDARD',
                ladder: [{ pool: null, standings }],
            },
        },
    };
}

function twoTeamStandings(): readonly Standing[] {
    return [
        makeStanding({
            teamId: 'team-a',
            teamName: 'Club A',
            orgId: 'org-a',
            orgName: 'Club A',
        }),
        makeStanding({
            teamId: 'team-b',
            teamName: 'Club B',
            orgId: 'org-b',
            orgName: 'Club B',
        }),
    ];
}

function gamesEnvelope(): CaptureEnvelope {
    return {
        data: {
            discoverGradeFixture: [
                {
                    id: 'round-1',
                    name: 'Round 1',
                    number: 1,
                    abbreviatedName: 'R1',
                    isFinalsRound: false,
                    byes: [],
                    games: [
                        {
                            id: 'game-1',
                            alias: null,
                            pool: null,
                            home: { id: 'team-a', name: 'Club A' },
                            away: { id: 'team-b', name: 'Club B' },
                            result: {
                                winner: { name: 'Home', value: 'HOME' },
                                outcome: {
                                    name: 'Home won',
                                    value: 'HOME_TEAM_WON_BY_SCORE',
                                },
                                home: {
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
                                    gameOutcomeDescription: '',
                                },
                                away: {
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
                                    gameOutcomeDescription: '',
                                },
                            },
                            status: { name: 'Final', value: 'FINAL' },
                            date: '2024-05-01',
                            dates: ['2024-05-01'],
                            allocation: { time: '18:00:00' },
                        },
                    ],
                },
            ],
        },
    };
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
            store,
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(collected.importData.seasons).toHaveLength(1);
        expect(collected.importData.seasons[0]).toMatchObject({
            seasonKey: 'amnd-winter-2024',
            isFinal: false,
            source: 'playhq',
            playhqId: 'season-2024',
        });
        expect(collected.importData.grades).toHaveLength(1);
        expect(collected.importData.teams).toHaveLength(2);
        expect(collected.importData.results).toHaveLength(2);
        expect(collected.importData.games).toStrictEqual([]);
        expect(collected.report).toMatchObject({
            seasons: 1,
            grades: 1,
            teams: 2,
            results: 2,
            games: 0,
        });
        expect(collected.seasons[0]?.status).toBe('active');
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
            ]),
        );

        const collected = await collectPlayHqData({
            store,
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
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
            store,
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
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
            store,
            cacheFirst: true,
            clubRegistry: new ClubRegistry([], []),
            isFinalBySeasonKey: new Map(),
            games: true,
            gradeId: 'grade-a',
        });

        expect(collected.importData.grades).toHaveLength(2);
        expect(collected.importData.games).toHaveLength(1);
        expect(collected.importData.games[0]).toMatchObject({
            playhqId: 'game-1',
            file: 'games-2024.csv',
            isFinals: false,
        });
        expect(collected.report.games).toBe(1);
    });
});
