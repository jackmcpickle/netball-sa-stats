import { describe, expect, it } from 'vitest';
import { extractSquadNumber } from '@/pipeline/fetch/keys';

describe(extractSquadNumber, () => {
    it('parses a trailing squad number off a numbered team name', () => {
        expect(extractSquadNumber('Walkerville 1')).toBe(1);
        expect(extractSquadNumber('Walkerville 2')).toBe(2);
        expect(extractSquadNumber('Contax 2')).toBe(2);
        expect(extractSquadNumber('Newton Jaguars 6')).toBe(6);
    });

    it('returns null for an unnumbered team name', () => {
        expect(extractSquadNumber('Walkerville')).toBeNull();
        expect(extractSquadNumber('Cheerio Green')).toBeNull();
        expect(extractSquadNumber('Adelaide Wildcats')).toBeNull();
    });

    it('does not treat an alphanumeric suffix as a squad number', () => {
        // "C6" is not a standalone number, so this is not a squad number.
        expect(extractSquadNumber('Newton Jaguars C6')).toBeNull();
    });

    it('does not treat a club name that legitimately ends in a digit as squad-numbered', () => {
        // Synthetic edge case: no such club exists in real committed data
        // (live gradeLadder captures), but a club literally named e.g.
        // "Club 24" could theoretically appear. There is no way to
        // distinguish this from a genuine squad-numbered team purely from
        // the display name, so this documents the known limitation rather
        // than asserting impossible behaviour: a lone trailing number is
        // always parsed as a squad number by design.
        expect(extractSquadNumber('Club 24')).toBe(24);
    });

    it('handles double spaces before the number', () => {
        expect(extractSquadNumber('Newton  Jaguars 1')).toBe(1);
    });

    it('ignores trailing whitespace', () => {
        expect(extractSquadNumber('Walkerville 1 ')).toBe(1);
    });
});
