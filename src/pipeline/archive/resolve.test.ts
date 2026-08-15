import { describe, expect, it } from 'vitest';
import {
    createArchiveClubResolver,
    normaliseArchiveClubName,
    syntheticArchivePlayhqId,
} from '@/pipeline/archive/resolve';

const aliases = [
    {
        alias_text: 'Adelaide University',
        club_key: 'adelaide-university',
        source: 'playhq',
    },
    {
        alias_text: 'Adeaide Uni.',
        club_key: 'adelaide-university',
        source: 'archive_pdf',
    },
    {
        alias_text: 'Western Jets',
        club_key: 'metro-jets',
        source: 'archive_pdf',
    },
    {
        alias_text: 'Phoenix',
        club_key: 'oakdale-netball-club-sa',
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
                gradeName: 'A. GRADE',
                ladderPosition: 4,
                year: 2016,
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
                clubKey: 'contax',
                gradeSlug: 'a-grade',
                seasonKey: 'amnd-winter-2016',
                squadNumber: null,
            }),
        ).toBe('archive:amnd-winter-2016:a-grade:contax:none');
        expect(
            syntheticArchivePlayhqId({
                clubKey: 'walkerville',
                gradeSlug: 'junior-4',
                seasonKey: 'amnd-winter-2016',
                squadNumber: 2,
            }),
        ).toBe('archive:amnd-winter-2016:junior-4:walkerville:2');
    });
});
