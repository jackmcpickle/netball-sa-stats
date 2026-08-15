import { describe, expect, it } from 'vitest';
import { describeDomainError, resolvePageResult } from '@/server/container';
import type { DomainError } from '@/server/domain/result';
import { err, ok } from '@/server/domain/result';

describe(describeDomainError, () => {
    it('describes not-found with the entity and key', () => {
        expect(
            describeDomainError({
                entity: 'club',
                key: 'nobody',
                kind: 'not-found',
            }),
        ).toBe('No club found for "nobody"');
    });

    it('describes not-found for a season', () => {
        expect(
            describeDomainError({
                entity: 'season',
                key: '1999',
                kind: 'not-found',
            }),
        ).toBe('No season found for "1999"');
    });

    it('describes not-found for a grade', () => {
        expect(
            describeDomainError({
                entity: 'grade',
                key: 'a1',
                kind: 'not-found',
            }),
        ).toBe('No grade found for "a1"');
    });

    it('describes no-ranked-seasons', () => {
        expect(describeDomainError({ kind: 'no-ranked-seasons' })).toBe(
            'No ranked seasons are available yet.',
        );
    });
});

describe(resolvePageResult, () => {
    it('returns the value for an ok result', () => {
        expect(resolvePageResult(ok(42))).toBe(42);
    });

    it('throws a notFound() error for a not-found DomainError', () => {
        const notFoundError: DomainError = {
            entity: 'club',
            key: 'nobody',
            kind: 'not-found',
        };
        // TanStack's `notFound()` returns a special object rather than an
        // `Error` instance, so assert on the thrown value's shape instead of
        // `toThrow`.
        let thrown: unknown;
        try {
            resolvePageResult(err(notFoundError));
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeDefined();
        expect(thrown).toMatchObject({ isNotFound: true });
    });

    it('throws a plain Error describing any other DomainError kind', () => {
        expect(() =>
            resolvePageResult(err({ kind: 'no-ranked-seasons' })),
        ).toThrow('No ranked seasons are available yet.');
    });
});
