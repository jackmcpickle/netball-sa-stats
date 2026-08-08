import { describe, expect, it } from 'vitest';
import { parseOptionalIntParam } from '@/routes/-search-params';

describe('parseOptionalIntParam', () => {
    it('passes through a valid integer string', () => {
        expect(parseOptionalIntParam('1999')).toBe(1999);
    });

    it('passes through a valid integer number', () => {
        expect(parseOptionalIntParam(1999)).toBe(1999);
    });

    it('treats an unparseable value as absent instead of throwing', () => {
        expect(parseOptionalIntParam('abc')).toBeUndefined();
    });

    it('treats an empty string as absent', () => {
        expect(parseOptionalIntParam('')).toBeUndefined();
    });

    it('treats undefined as absent', () => {
        expect(parseOptionalIntParam(undefined)).toBeUndefined();
    });

    it('accepts negative integers as a hint, letting the loader decide validity', () => {
        expect(parseOptionalIntParam('-1')).toBe(-1);
    });
});
