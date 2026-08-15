import { describe, expect, it } from 'vitest';
import {
    createArchiveClubResolver,
    normaliseArchiveClubName,
    syntheticArchivePlayhqId,
} from '@/pipeline/archive/resolve';

const aliases = [
    {
        club_key: 'adelaide-university',
        alias_text: 'Adelaide University',
        source: 'playhq',
    },
    {
        club_key: 'adelaide-university',
        alias_text: 'Adeaide Uni.',
        source: 'archive_pdf',
    },
    {
        club_key: 'metro-jets',
        alias_text: 'Western Jets',
        source: 'archive_pdf',
    },
    {
        club_key: 'oakdale-netball-club-sa',
        alias_text: 'Phoenix',
        source: 'archive_pdf',
    },
] as const;

describe(normaliseArchiveClubName, () => {
    it('normalises case, punctuation and whitespace for alias lookup', () => {
        expect(normaliseArchiveClubName(' Adeaide   Uni. ')).toBe(
            normaliseArchiveClubName('adeaide uni'),
        );
        expect(normaliseArchiveClubName('CardijnCats')).toBe(
            normaliseArchiveClubName('cardijn cats'),
        );
        expect(normaliseArchiveClubName('Glandore/Clov.Pk')).toBe(
            normaliseArchiveClubName('glandore clov pk'),
        );
    });
});

describe(createArchiveClubResolver, () => {
    it('resolves curated archive aliases to club keys', () => {
        const resolver = createArchiveClubResolver(aliases);

        expect(resolver.resolve('Adeaide Uni.', { year: 2001 })).toBe(
            'adelaide-university',
        );
        expect(resolver.resolve('WESTERN JETS', { year: 2008 })).toBe(
            'metro-jets',
        );
        expect(resolver.resolve('Phoenix', { year: 2003 })).toBe(
            'oakdale-netball-club-sa',
        );
    });

    it('fails loudly on unknown archive club names with row context', () => {
        const resolver = createArchiveClubResolver(aliases);

        expect(() =>
            resolver.resolve('Mystery Club', {
                year: 2016,
                gradeName: 'A. GRADE',
                ladderPosition: 4,
            }),
        ).toThrow(
            'Unknown archive club name "Mystery Club" in 2016 A. GRADE position 4',
        );
    });
});

describe(syntheticArchivePlayhqId, () => {
    it('uses the locked archive id format and a stable null-squad token', () => {
        expect(
            syntheticArchivePlayhqId({
                seasonKey: 'amnd-winter-2016',
                gradeSlug: 'a-grade',
                clubKey: 'contax',
                squadNumber: null,
            }),
        ).toBe('archive:amnd-winter-2016:a-grade:contax:none');
        expect(
            syntheticArchivePlayhqId({
                seasonKey: 'amnd-winter-2016',
                gradeSlug: 'junior-4',
                clubKey: 'walkerville',
                squadNumber: 2,
            }),
        ).toBe('archive:amnd-winter-2016:junior-4:walkerville:2');
    });
});
