import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import { flattenStandings } from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';
import {
    archiveRowsToKeep,
    processGrade,
    resolveCompetitionKey,
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
    const response = JSON.parse(
        readFileSync(ladderFixturePath, 'utf8'),
    ) as GradeLadderResponse;
    const discoverGrade = response.data.discoverGrade;
    if (discoverGrade === null) throw new Error('fixture has no discoverGrade');
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

describe('resolveCompetitionKey', () => {
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
            1_000,
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
            1_000,
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
            1_000,
        );
        expect(result?.seasonRow.is_final).toBe(0);
    });

    it('still records PlayHQ status informationally, independent of is_final', () => {
        const registry = new ClubRegistry([], []);
        const isFinalBySeasonKey = new Map([
            ['premier_league-annual-2023', '1'],
        ]);
        const ctx = baseCtx(isFinalBySeasonKey);
        const result = processGrade(grade, standings, ctx, registry, 1_000);
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
        const result = processGrade(grade, standings, ctx, registry, 1_000);
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
            1_000,
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
            1_000,
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
        const result = processGrade(grade, standings, ctx, registry, 1_000);
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

describe('archiveRowsToKeep', () => {
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
        expect(kept.seasons.map((row) => row.season_key)).toEqual([
            'amnd-winter-2005',
        ]);
    });

    it('keeps grades belonging to an archive season', () => {
        const kept = archiveRowsToKeep(existing);
        expect(kept.grades.map((row) => row.grade_key)).toEqual(['a-2005']);
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
        expect(kept.seasons).toEqual([]);
        expect(kept.grades).toEqual([]);
        expect(kept.teams).toEqual([]);
        expect(kept.results).toEqual([]);
    });
});
