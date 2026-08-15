import { describe, expect, it } from 'vitest';
import { mapArchiveGradeName } from '@/pipeline/archive/grade-map';

describe(mapArchiveGradeName, () => {
    it('maps early A1/A2 headers to the locked AMND tiers', () => {
        expect(mapArchiveGradeName('A1.', 2000)).toMatchObject({
            displayName: 'AMND League',
            tier: 3,
            division: null,
            ageBand: 'Senior',
            slug: 'amnd-league',
        });
        expect(mapArchiveGradeName('A. 2', 2009)).toMatchObject({
            displayName: 'A. Grade',
            tier: 4,
            division: null,
            ageBand: 'Senior',
            slug: 'a-grade',
        });
    });

    it('keeps H Grade as the display name but weights it as Inter 6', () => {
        expect(mapArchiveGradeName('H GRADE', 2001)).toMatchObject({
            displayName: 'H Grade',
            tier: 6,
            division: 6,
            ageBand: 'Intermediate',
            slug: 'h-grade',
        });
        expect(mapArchiveGradeName('H.Grade', 2008).displayName).toBe(
            'H Grade',
        );
    });

    it('normalises historical abbreviations before reusing grade parsing', () => {
        expect(mapArchiveGradeName('INT. 4', 2004)).toMatchObject({
            displayName: 'Inter. 4',
            tier: 6,
            division: 4,
            ageBand: 'Intermediate',
        });
        expect(mapArchiveGradeName('JNR. 9', 2012)).toMatchObject({
            displayName: 'Junior 9',
            tier: 8,
            division: 9,
            ageBand: 'Junior',
        });
        expect(mapArchiveGradeName('S.J. 9', 2010)).toMatchObject({
            displayName: 'Sub-Junior 9',
            tier: 9,
            division: 9,
            ageBand: 'Junior',
        });
        expect(mapArchiveGradeName('Prim. 7', 2009)).toMatchObject({
            displayName: 'Primary 7',
            tier: 10,
            division: 7,
            ageBand: 'Junior',
        });
    });
});
