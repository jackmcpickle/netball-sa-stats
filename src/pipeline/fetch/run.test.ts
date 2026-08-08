import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import { flattenStandings } from '@/pipeline/fetch/ladder';
import type { Standing } from '@/pipeline/fetch/ladder';
import { processGrade, resolveCompetitionKey } from '@/pipeline/fetch/run';
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
