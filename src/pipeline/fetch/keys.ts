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
    if (!taken.has(slug)) return slug;
    let suffix = 2;
    while (taken.has(`${slug}-${suffix}`)) suffix += 1;
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

/** `Walkerville (2)` -> 2. Teams without a suffix have no squad number. */
export function extractSquadNumber(teamName: string): number | null {
    const match = teamName.match(/\((\d+)\)\s*$/u);
    return match?.[1] === undefined ? null : Number(match[1]);
}
