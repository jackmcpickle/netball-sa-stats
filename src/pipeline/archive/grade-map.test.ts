import { describe, expect, it } from 'vitest';
import { mapArchiveGradeName } from '@/pipeline/archive/grade-map';

describe(mapArchiveGradeName, () => {
    it('maps early A1/A2 headers to the locked AMND tiers', () => {
        expect(mapArchiveGradeName('A1.', 2000)).toMatchObject({
            ageBand: 'Senior',
            displayName: 'AMND League',
            division: null,
            slug: 'amnd-league',
            tier: 3,
        });
        expect(mapArchiveGradeName('A. 2', 2009)).toMatchObject({
            ageBand: 'Senior',
            displayName: 'A. Grade',
            division: null,
            slug: 'a-grade',
            tier: 4,
        });
    });

    it('keeps H Grade as the display name but weights it as Inter 6', () => {
        expect(mapArchiveGradeName('H GRADE', 2001)).toMatchObject({
            ageBand: 'Intermediate',
            displayName: 'H Grade',
            division: 6,
            slug: 'h-grade',
            tier: 6,
        });
        expect(mapArchiveGradeName('H.Grade', 2008).displayName).toBe(
            'H Grade',
        );
    });

    it('normalises historical abbreviations before reusing grade parsing', () => {
        expect(mapArchiveGradeName('INT. 4', 2004)).toMatchObject({
            ageBand: 'Intermediate',
            displayName: 'Inter. 4',
            division: 4,
            tier: 6,
        });
        expect(mapArchiveGradeName('JNR. 9', 2012)).toMatchObject({
            ageBand: 'Junior',
            displayName: 'Junior 9',
            division: 9,
            tier: 8,
        });
        expect(mapArchiveGradeName('S.J. 9', 2010)).toMatchObject({
            ageBand: 'Junior',
            displayName: 'Sub-Junior 9',
            division: 9,
            tier: 9,
        });
        expect(mapArchiveGradeName('Prim. 7', 2009)).toMatchObject({
            ageBand: 'Junior',
            displayName: 'Primary 7',
            division: 7,
            tier: 10,
        });
    });
});
