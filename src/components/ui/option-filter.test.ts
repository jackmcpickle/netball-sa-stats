import { describe, expect, it } from 'vitest';
import {
    filterOptions,
    matchesQuery,
    normaliseQuery,
    queryTerms,
} from '@/components/ui/option-filter';

const grades = [
    { label: 'Premier Division', hint: 'Championship Competition' },
    { label: 'Division 1', hint: 'Championship Competition' },
    { label: 'Junior 4A', hint: 'Junior Competition' },
    { label: 'Junior 4B', hint: 'Junior Competition' },
    { label: '17 & Under A', hint: 'Age Competition' },
] as const;

describe('normaliseQuery', () => {
    it('lowercases and collapses punctuation to single spaces', () => {
        expect(normaliseQuery('  Junior-4A / B  ')).toBe('junior 4a b');
    });

    it('returns an empty string for punctuation only input', () => {
        expect(normaliseQuery(' &/- ')).toBe('');
    });
});

describe('queryTerms', () => {
    it('splits on whitespace', () => {
        expect(queryTerms('junior 4')).toEqual(['junior', '4']);
    });

    it('yields no terms for a blank query', () => {
        expect(queryTerms('   ')).toEqual([]);
    });
});

describe('matchesQuery', () => {
    it('matches everything when the query is blank', () => {
        expect(matchesQuery(grades[0], '')).toBe(true);
        expect(matchesQuery(grades[0], '   ')).toBe(true);
    });

    it('matches on a label prefix', () => {
        expect(matchesQuery(grades[0], 'prem')).toBe(true);
    });

    it('matches case insensitively', () => {
        expect(matchesQuery(grades[0], 'PREMIER')).toBe(true);
    });

    it('matches on the hint alone', () => {
        expect(matchesQuery(grades[2], 'junior competition')).toBe(true);
    });

    it('requires every term to match', () => {
        expect(matchesQuery(grades[2], 'junior 4')).toBe(true);
        expect(matchesQuery(grades[2], 'junior 9')).toBe(false);
    });

    it('matches terms in any order and across label and hint', () => {
        expect(matchesQuery(grades[1], 'championship 1')).toBe(true);
    });

    it('ignores punctuation in the option and the query', () => {
        expect(matchesQuery(grades[4], '17 under')).toBe(true);
        expect(matchesQuery(grades[4], '17&under')).toBe(true);
    });

    it('treats an option without a hint as label only', () => {
        expect(matchesQuery({ label: 'Division 1' }, 'championship')).toBe(
            false,
        );
    });
});

describe('filterOptions', () => {
    it('returns every option for a blank query', () => {
        expect(filterOptions(grades, '')).toHaveLength(grades.length);
    });

    it('narrows to the junior grades', () => {
        expect(filterOptions(grades, 'junior 4').map((g) => g.label)).toEqual([
            'Junior 4A',
            'Junior 4B',
        ]);
    });

    it('returns nothing when there are no matches', () => {
        expect(filterOptions(grades, 'zzz')).toEqual([]);
    });

    it('preserves the original order', () => {
        expect(
            filterOptions(grades, 'competition').map((g) => g.label),
        ).toEqual([
            'Premier Division',
            'Division 1',
            'Junior 4A',
            'Junior 4B',
            '17 & Under A',
        ]);
    });
});
