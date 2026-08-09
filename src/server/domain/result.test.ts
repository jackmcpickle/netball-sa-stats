import { describe, expect, it } from 'vitest';
import { err, map, ok, unwrapOr } from '@/server/domain/result';

describe('Result', () => {
    it('ok narrows to the value branch', () => {
        const result = ok(42);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    it('err narrows to the error branch', () => {
        const result = err('bad');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toBe('bad');
        }
    });

    it('map transforms an ok value and leaves an err untouched', () => {
        expect(map(ok(2), (value) => value * 2)).toEqual(ok(4));
        expect(map(err('bad'), (value: number) => value * 2)).toEqual(
            err('bad'),
        );
    });

    it('unwrapOr returns the value for ok and the fallback for err', () => {
        expect(unwrapOr(ok(1), 99)).toBe(1);
        expect(unwrapOr(err('bad'), 99)).toBe(99);
    });
});
