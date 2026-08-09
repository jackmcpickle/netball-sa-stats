import { describe, expect, it } from 'vitest';
import { ClubDirectory } from '@/server/domain/club-directory';
import type { Club } from '@/server/dto/shared.dto';

function club(key: string): Club {
    return {
        key,
        name: key,
        establishedYear: null,
        homeVenue: null,
        accent: 'pink',
    };
}

describe('ClubDirectory.partition', () => {
    it('splits clubs by presence in the ranked key set', () => {
        const result = ClubDirectory.partition(
            [club('contax'), club('brahma')],
            new Set(['contax']),
        );
        expect(result.present.map((c) => c.key)).toEqual(['contax']);
        expect(result.past.map((c) => c.key)).toEqual(['brahma']);
    });

    it('preserves the incoming order within each group', () => {
        const result = ClubDirectory.partition(
            [club('a'), club('b'), club('c'), club('d')],
            new Set(['b', 'd']),
        );
        expect(result.present.map((c) => c.key)).toEqual(['b', 'd']);
        expect(result.past.map((c) => c.key)).toEqual(['a', 'c']);
    });

    it('treats every club as past when nothing is ranked', () => {
        const result = ClubDirectory.partition(
            [club('a'), club('b')],
            new Set(),
        );
        expect(result.present).toEqual([]);
        expect(result.past).toHaveLength(2);
    });

    it('ignores ranked keys with no matching club', () => {
        const result = ClubDirectory.partition(
            [club('a')],
            new Set(['a', 'ghost']),
        );
        expect(result.present.map((c) => c.key)).toEqual(['a']);
        expect(result.past).toEqual([]);
    });
});
