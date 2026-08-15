import { describe, expect, it } from 'vitest';
import {
    parseOptionalBoolParam,
    parseOptionalDirParam,
    parseOptionalIntParam,
} from '@/routes/-search-params';

describe(parseOptionalIntParam, () => {
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

describe(parseOptionalBoolParam, () => {
    it('passes through boolean true', () => {
        expect(parseOptionalBoolParam(true)).toBeTruthy();
    });

    it('passes through boolean false', () => {
        expect(parseOptionalBoolParam(false)).toBeFalsy();
    });

    it('treats "true" as true', () => {
        expect(parseOptionalBoolParam('true')).toBeTruthy();
    });

    it('treats "1" as true', () => {
        expect(parseOptionalBoolParam('1')).toBeTruthy();
    });

    it('treats "false" as false', () => {
        expect(parseOptionalBoolParam('false')).toBeFalsy();
    });

    it('treats "0" as false', () => {
        expect(parseOptionalBoolParam('0')).toBeFalsy();
    });

    it('treats an unrecognised string as absent instead of coercing to true', () => {
        expect(parseOptionalBoolParam('yes')).toBeUndefined();
    });

    it('treats an empty string as absent', () => {
        expect(parseOptionalBoolParam('')).toBeUndefined();
    });

    it('treats undefined as absent', () => {
        expect(parseOptionalBoolParam(undefined)).toBeUndefined();
    });
});

describe(parseOptionalDirParam, () => {
    it('passes through "asc"', () => {
        expect(parseOptionalDirParam('asc')).toBe('asc');
    });

    it('passes through "desc"', () => {
        expect(parseOptionalDirParam('desc')).toBe('desc');
    });

    it('treats an unrecognised string as absent instead of throwing', () => {
        expect(parseOptionalDirParam('x')).toBeUndefined();
    });

    it('treats an empty string as absent', () => {
        expect(parseOptionalDirParam('')).toBeUndefined();
    });

    it('treats undefined as absent', () => {
        expect(parseOptionalDirParam(undefined)).toBeUndefined();
    });
});
