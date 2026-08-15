import { isUndefined } from 'es-toolkit';
/** Slug and stable-key helpers shared across the fetch pipeline. */

export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, '-')
        .replaceAll(/^-+|-+$/gu, '');
}

/** Appends `-2`, `-3`, ... on collision so club_key stays unique and stable. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
    const slug = slugify(base);
    if (!taken.has(slug)) {
        return slug;
    }
    let suffix = 2;
    while (taken.has(`${slug}-${suffix}`)) {
        suffix += 1;
    }
    return `${slug}-${suffix}`;
}

export function buildSeasonKey(
    competitionKey: string,
    period: string,
    startYear: number,
): string {
    return `${competitionKey}-${period}-${startYear}`;
}

export function buildGradeKey(seasonKey: string, gradeName: string): string {
    return `${seasonKey}-${slugify(gradeName)}`;
}

/**
 * PlayHQ encodes a team's squad number as a trailing standalone digit group,
 * e.g. `Contax 2`, `Walkerville 1`. A club with a single unnumbered team in a
 * grade has no trailing number - that's valid and yields `null`, not a
 * fabricated squad number. An alphanumeric suffix (e.g. `Newton Jaguars C6`)
 * is not a squad number and is left alone.
 */
export function extractSquadNumber(teamName: string): number | null {
    const squadNumber = /\s(?<squadNumber>\d+)$/u.exec(teamName.trimEnd())
        ?.groups?.squadNumber;
    return isUndefined(squadNumber) ? null : Number(squadNumber);
}
