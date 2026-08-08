/**
 * Parses PlayHQ grade display names into (tier, division), per the band
 * table in `src/pipeline/seed/catalogue.ts` (authoritative tier numbering).
 *
 * PlayHQ's real names vary in spacing/punctuation from the brief's examples
 * (`data/raw/probe/gradeListDiscoverSeason_amnd_winter2023_7570c2c4.json`
 * has e.g. `AMND`, `A GRADE`, `B1`, `INTER 1`, `Sub Junior 1`) so matching is
 * done on a normalised (uppercased, punctuation-stripped) form. An
 * unrecognised name throws — never silently dropped or bucketed.
 */

export type ParsedGrade = {
    tier: number;
    division: number | null;
};

type Rule = {
    /** Matches the whole normalised name; captures the division digits if any. */
    pattern: RegExp;
    tier: number;
};

// Normalised = uppercased, `.`/`-` collapsed to spaces, runs of whitespace
// collapsed to one space, trimmed. So "B.3", "B. 3", "B3", "b 3" all match
// the same rule.
function normalise(name: string): string {
    return name
        .toUpperCase()
        .replaceAll(/[.-]/gu, ' ')
        .replaceAll(/\s+/gu, ' ')
        .trim();
}

const RULES: readonly Rule[] = [
    { pattern: /^PREMIER DIVISION$/u, tier: 1 },
    { pattern: /^RESERVES DIVISION$/u, tier: 2 },
    { pattern: /^AMND(?: LEAGUE)?$/u, tier: 3 },
    { pattern: /^A GRADE$/u, tier: 4 },
    // Trailing letter (e.g. "Junior 4A") marks a split A/B pool within the same
    // division — grade_key still disambiguates via the full name, division stays
    // the numeric part.
    { pattern: /^B ?(\d+) ?[A-Z]?$/u, tier: 5 },
    { pattern: /^INTER ?(\d+) ?[A-Z]?$/u, tier: 6 },
    { pattern: /^C ?(\d+) ?[A-Z]?$/u, tier: 7 },
    { pattern: /^JUNIOR ?(\d+) ?[A-Z]?$/u, tier: 8 },
    { pattern: /^SUB JUNIOR ?(\d+) ?[A-Z]?$/u, tier: 9 },
    { pattern: /^PRIMARY ?(\d+) ?[A-Z]?$/u, tier: 10 },
    { pattern: /^SUB PRIMARY ?(\d+) ?[A-Z]?$/u, tier: 11 },
];

export function parseGradeName(name: string): ParsedGrade {
    const normalised = normalise(name);
    for (const rule of RULES) {
        const match = normalised.match(rule.pattern);
        if (match !== null) {
            const [, digits] = match;
            return {
                tier: rule.tier,
                division: digits === undefined ? null : Number(digits),
            };
        }
    }
    throw new Error(`parseGradeName: unrecognised grade name "${name}"`);
}
