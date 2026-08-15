import { describe, expect, it } from 'vitest';
import { err, ok } from '@/server/domain/result';

describe('Result', () => {
    it('ok narrows to the value branch', () => {
        const result = ok(42);
        expect(result.ok).toBeTruthy();
        if (result.ok) {
            expect(result.value).toBe(42);
        }
    });

    it('err narrows to the error branch', () => {
        const result = err('bad');
        expect(result.ok).toBeFalsy();
        if (!result.ok) {
            expect(result.error).toBe('bad');
        }
    });
});
