import { isNull, isUndefined } from 'es-toolkit';
import { parseGradeName } from '@/pipeline/fetch/grade-name';
import { slugify } from '@/pipeline/fetch/keys';

export interface ArchiveGrade {
    originalName: string;
    displayName: string;
    tier: number;
    division: number | null;
    ageBand: string;
    slug: string;
}

function normaliseGradeHeader(name: string): string {
    return name
        .toUpperCase()
        .replaceAll(/[.-]/gu, ' ')
        .replaceAll(/\s+/gu, ' ')
        .trim();
}

function letterGradeName(normalised: string): string | null {
    const grade = /^(?<letter>[A-H]) ?(?<division>\d+)?$/u.exec(normalised);
    if (isNull(grade)) {
        return null;
    }
    const { letter, division } = grade.groups ?? {};
    if (letter === 'A' && division === '1') {
        return 'AMND League';
    }
    if (letter === 'A' && division === '2') {
        return 'A. Grade';
    }
    if (letter === 'H' && isUndefined(division)) {
        return 'H Grade';
    }
    return isUndefined(division) ? null : `${letter}. ${division}`;
}

function namedSeniorGrade(normalised: string): string | null {
    if (normalised === 'AMND LEAGUE' || normalised === 'AMND') {
        return 'AMND League';
    }
    if (normalised === 'A GRADE') {
        return 'A. Grade';
    }
    if (normalised === 'H GRADE') {
        return 'H Grade';
    }
    return null;
}

function numberedGradeName(normalised: string): string | null {
    const rules: readonly [RegExp, string][] = [
        [/^(?:INT|INTER|INTERMEDIATE) ?(?<division>\d+)$/u, 'Inter.'],
        [/^(?:JNR|JUNIOR) ?(?<division>\d+)$/u, 'Junior'],
        [/^(?:S J|SUB JUNIOR) ?(?<division>\d+)$/u, 'Sub-Junior'],
        [/^(?:PRIM|PRIMARY) ?(?<division>\d+)$/u, 'Primary'],
    ];
    for (const [pattern, prefix] of rules) {
        const division = pattern.exec(normalised)?.groups?.division;
        if (!isUndefined(division)) {
            return `${prefix} ${division}`;
        }
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
    if (tier === 6) {
        return 'Intermediate';
    }
    if (tier >= 8) {
        return 'Junior';
    }
    return 'Senior';
}

export function mapArchiveGradeName(name: string, _year: number): ArchiveGrade {
    const displayName = canonicalGradeName(name);
    const parsed =
        displayName === 'H Grade'
            ? { division: 6, tier: 6 }
            : parseGradeName(displayName);
    return {
        ageBand: ageBandFor(parsed.tier),
        displayName,
        division: parsed.division,
        originalName: name,
        slug: slugify(displayName),
        tier: parsed.tier,
    };
}
