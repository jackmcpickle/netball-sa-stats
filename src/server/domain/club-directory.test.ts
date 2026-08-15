import { describe, expect, it } from 'vitest';
import { partitionClubs } from '@/server/domain/club-directory';
import type { Club } from '@/server/dto/shared.dto';

function club(key: string): Club {
    return {
        accent: 'pink',
        establishedYear: null,
        homeVenue: null,
        key,
        name: key,
    };
}

describe(partitionClubs, () => {
    it('splits clubs by presence in the ranked key set', () => {
        const result = partitionClubs(
            [club('contax'), club('brahma')],
            new Set(['contax']),
        );
        expect(result.present.map((c) => c.key)).toStrictEqual(['contax']);
        expect(result.past.map((c) => c.key)).toStrictEqual(['brahma']);
    });

    it('preserves the incoming order within each group', () => {
        const result = partitionClubs(
            [club('a'), club('b'), club('c'), club('d')],
            new Set(['b', 'd']),
        );
        expect(result.present.map((c) => c.key)).toStrictEqual(['b', 'd']);
        expect(result.past.map((c) => c.key)).toStrictEqual(['a', 'c']);
    });

    it('treats every club as past when nothing is ranked', () => {
        const result = partitionClubs([club('a'), club('b')], new Set());
        expect(result.present).toStrictEqual([]);
        expect(result.past).toHaveLength(2);
    });

    it('ignores ranked keys with no matching club', () => {
        const result = partitionClubs([club('a')], new Set(['a', 'ghost']));
        expect(result.present.map((c) => c.key)).toStrictEqual(['a']);
        expect(result.past).toStrictEqual([]);
    });
});
