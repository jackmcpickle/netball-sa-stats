/**
 * Parses PlayHQ grade display names into (tier, division), per the band
 * table in `src/pipeline/seed/catalogue.ts` (authoritative tier numbering
 * for AMND / Premier League).
 *
 * PlayHQ's real names vary in spacing/punctuation from the brief's examples
 * (`data/raw/probe/gradeListDiscoverSeason_amnd_winter2023_7570c2c4.json`
 * has e.g. `AMND`, `A GRADE`, `B1`, `INTER 1`, `Sub Junior 1`) so matching is
 * done on a normalised (uppercased, punctuation-stripped) form. An
 * unrecognised AMND / Premier League name throws. Association keys use a
 * separate rule table, then fall back to tier 20 so an unknown grade does
 * not abort the fetch. 20 is the import schema ceiling and is not a
 * championship weight.
 */
import { isNull, isUndefined } from 'es-toolkit';
import { ASSOCIATION_COMPETITION_KEYS } from '@/pipeline/seed/catalogue';

export interface ParsedGrade {
    tier: number;
    division: number | null;
}

interface Rule {
    /** Matches the whole normalised name; captures the division digits if any. */
    pattern: RegExp;
    tier: number;
}

// Normalised = uppercased, `.`/`-`/`/` collapsed to spaces, runs of whitespace
// collapsed to one space, trimmed. So "B.3", "B. 3", "B3", "b 3" all match
// the same rule. Association names also use slashes (`8U/1`).
function normalise(name: string): string {
    return name
        .toUpperCase()
        .replaceAll(/[./-]/gu, ' ')
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
    { pattern: /^B ?(?<division>\d+) ?[A-Z]?$/u, tier: 5 },
    { pattern: /^INTER ?(?<division>\d+) ?[A-Z]?$/u, tier: 6 },
    { pattern: /^C ?(?<division>\d+) ?[A-Z]?$/u, tier: 7 },
    { pattern: /^JUNIOR ?(?<division>\d+) ?[A-Z]?$/u, tier: 8 },
    { pattern: /^SUB JUNIOR ?(?<division>\d+) ?[A-Z]?$/u, tier: 9 },
    { pattern: /^PRIMARY ?(?<division>\d+) ?[A-Z]?$/u, tier: 10 },
    { pattern: /^SUB PRIMARY ?(?<division>\d+) ?[A-Z]?$/u, tier: 11 },
];

/**
 * Local seniority inside one association. 1 is the top senior grade.
 * These numbers are not AMND weights and are not scored until calibrated.
 */
const ASSOCIATION_RULES: readonly Rule[] = [
    { pattern: /^A GRADE$/u, tier: 1 },
    { pattern: /^A ?(?<division>\d+)(?: GRADE)?$/u, tier: 1 },
    { pattern: /^SENIORS DIV(?:ISION)? 0*(?<division>\d+)$/u, tier: 1 },
    { pattern: /^M LEAGUE MENS DIVISION$/u, tier: 1 },
    { pattern: /^B ?(?<division>\d+)$/u, tier: 2 },
    { pattern: /^M LEAGUE JUNIOR DIVISION$/u, tier: 2 },
    { pattern: /^C GRADE$/u, tier: 3 },
    { pattern: /^C ?(?<division>\d+)$/u, tier: 3 },
    { pattern: /^D ?(?<division>\d+)$/u, tier: 3 },
    { pattern: /^INTERS? DIV(?:ISION)? 0*(?<division>\d+)$/u, tier: 4 },
    { pattern: /^INTERS? 0*(?<division>\d+)(?: [A-Z])?$/u, tier: 4 },
    { pattern: /^JUNIOR ?(?<division>\d+) ?[A-Z]?$/u, tier: 8 },
    { pattern: /^SUB JUNIOR ?(?<division>\d+) ?[A-Z]?$/u, tier: 9 },
    { pattern: /^PRIMARY ?(?<division>\d+) ?[A-Z]?$/u, tier: 10 },
    { pattern: /^SUB PRIMARY ?(?<division>\d+) ?[A-Z]?$/u, tier: 11 },
    { pattern: /^NSG SET$/u, tier: 12 },
    { pattern: /^NSG GO(?<division>\d+)$/u, tier: 12 },
    {
        pattern:
            /^(?<age>8|9|11|13|15|17) ?(?:& ?)?U(?:NDERS?)? DIV(?:ISION)? ?0*(?<division>\d+)$/u,
        tier: 0,
    },
    {
        pattern:
            /^(?<age>8|9|11|13|15|17) ?(?:& ?)?U(?:NDERS?)? 0*(?<division>\d+)$/u,
        tier: 0,
    },
];

const AGE_TIER = new Map<string, number>([
    ['17', 5],
    ['15', 6],
    ['13', 7],
    ['11', 8],
    ['9', 9],
    ['8', 10],
]);

function matchRule(normalised: string, rule: Rule): ParsedGrade | null {
    const match = normalised.match(rule.pattern);
    if (isNull(match)) {
        return null;
    }
    const digits = match.groups?.division;
    const age = match.groups?.age;
    const ageTier = isUndefined(age) ? undefined : AGE_TIER.get(age);
    return {
        division: isUndefined(digits) ? null : Number(digits),
        tier: isUndefined(ageTier) ? rule.tier : ageTier,
    };
}

function associationFallback(name: string): ParsedGrade {
    const normalised = normalise(name);
    const match = /(?<division>\d+) ?[A-Z]?$/u.exec(normalised);
    const digits = match?.groups?.division;
    return {
        division: isUndefined(digits) ? null : Number(digits),
        tier: 20,
    };
}

function parseWith(
    name: string,
    rules: readonly Rule[],
    unknown: 'throw' | 'fallback',
): ParsedGrade {
    const normalised = normalise(name);
    for (const rule of rules) {
        const parsed = matchRule(normalised, rule);
        if (!isNull(parsed)) {
            return parsed;
        }
    }
    if (unknown === 'fallback') {
        return associationFallback(name);
    }
    throw new Error(`parseGradeName: unrecognised grade name "${name}"`);
}

export function parseGradeName(
    name: string,
    competitionKey?: string,
): ParsedGrade {
    if (
        !isUndefined(competitionKey) &&
        ASSOCIATION_COMPETITION_KEYS.has(competitionKey)
    ) {
        return parseWith(name, ASSOCIATION_RULES, 'fallback');
    }
    return parseWith(name, RULES, 'throw');
}
