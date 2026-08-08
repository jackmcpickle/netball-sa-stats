import { parseGradeName } from '@/pipeline/fetch/grade-name';
import { slugify } from '@/pipeline/fetch/keys';

export type ArchiveGrade = {
    originalName: string;
    displayName: string;
    tier: number;
    division: number | null;
    ageBand: string;
    slug: string;
};

function normaliseGradeHeader(name: string): string {
    return name
        .toUpperCase()
        .replaceAll(/[.-]/gu, ' ')
        .replaceAll(/\s+/gu, ' ')
        .trim();
}

function letterGradeName(normalised: string): string | null {
    const grade = normalised.match(/^([A-H]) ?(\d+)?$/u);
    if (grade === null) return null;
    const [, letter, division] = grade;
    if (letter === 'A' && division === '1') return 'AMND League';
    if (letter === 'A' && division === '2') return 'A. Grade';
    if (letter === 'H' && division === undefined) return 'H Grade';
    return division === undefined ? null : `${letter}. ${division}`;
}

function namedSeniorGrade(normalised: string): string | null {
    if (normalised === 'AMND LEAGUE' || normalised === 'AMND') {
        return 'AMND League';
    }
    if (normalised === 'A GRADE') return 'A. Grade';
    if (normalised === 'H GRADE') return 'H Grade';
    return null;
}

function numberedGradeName(normalised: string): string | null {
    const rules: readonly [RegExp, string][] = [
        [/^(?:INT|INTER|INTERMEDIATE) ?(\d+)$/u, 'Inter.'],
        [/^(?:JNR|JUNIOR) ?(\d+)$/u, 'Junior'],
        [/^(?:S J|SUB JUNIOR) ?(\d+)$/u, 'Sub-Junior'],
        [/^(?:PRIM|PRIMARY) ?(\d+)$/u, 'Primary'],
    ];
    for (const [pattern, prefix] of rules) {
        const match = normalised.match(pattern);
        if (match?.[1] !== undefined) return `${prefix} ${match[1]}`;
    }
    return null;
}

function canonicalGradeName(name: string): string {
    const normalised = normaliseGradeHeader(name);
    return (
        letterGradeName(normalised) ??
        namedSeniorGrade(normalised) ??
        numberedGradeName(normalised) ??
        name
    );
}

function ageBandFor(tier: number): string {
    if (tier === 6) return 'Intermediate';
    if (tier >= 8) return 'Junior';
    return 'Senior';
}

export function mapArchiveGradeName(name: string, _year: number): ArchiveGrade {
    const displayName = canonicalGradeName(name);
    const parsed =
        displayName === 'H Grade'
            ? { tier: 6, division: 6 }
            : parseGradeName(displayName);
    return {
        originalName: name,
        displayName,
        tier: parsed.tier,
        division: parsed.division,
        ageBand: ageBandFor(parsed.tier),
        slug: slugify(displayName),
    };
}
