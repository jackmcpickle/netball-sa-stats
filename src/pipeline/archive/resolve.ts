export type ClubAliasRow = {
    club_key: string;
    alias_text: string;
    source: string;
};

export type ResolveContext = {
    year: number;
    gradeName?: string;
    ladderPosition?: number;
};

export type SyntheticArchivePlayhqIdInput = {
    seasonKey: string;
    gradeSlug: string;
    clubKey: string;
    squadNumber: number | null;
};

export function normaliseArchiveClubName(name: string): string {
    return name
        .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, ' ')
        .replaceAll(/\s+/gu, ' ')
        .trim();
}

function contextText(context: ResolveContext): string {
    const grade =
        context.gradeName === undefined ? '' : ` ${context.gradeName}`;
    const position =
        context.ladderPosition === undefined
            ? ''
            : ` position ${String(context.ladderPosition)}`;
    return `${String(context.year)}${grade}${position}`;
}

export function createArchiveClubResolver(aliases: readonly ClubAliasRow[]): {
    resolve: (name: string, context: ResolveContext) => string;
} {
    const byAlias = new Map<string, string>();
    for (const alias of aliases) {
        const normalised = normaliseArchiveClubName(alias.alias_text);
        const existing = byAlias.get(normalised);
        if (existing !== undefined && existing !== alias.club_key) {
            throw new Error(
                `Archive alias "${alias.alias_text}" maps to both ${existing} and ${alias.club_key}`,
            );
        }
        byAlias.set(normalised, alias.club_key);
    }

    return {
        resolve(name, context) {
            const clubKey = byAlias.get(normaliseArchiveClubName(name));
            if (clubKey === undefined) {
                throw new Error(
                    `Unknown archive club name "${name}" in ${contextText(context)}`,
                );
            }
            return clubKey;
        },
    };
}

export function syntheticArchivePlayhqId(
    input: SyntheticArchivePlayhqIdInput,
): string {
    const squad =
        input.squadNumber === null ? 'none' : String(input.squadNumber);
    return `archive:${input.seasonKey}:${input.gradeSlug}:${input.clubKey}:${squad}`;
}
