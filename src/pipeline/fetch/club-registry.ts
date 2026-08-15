/**
 * Club identity + curated club_aliases. `club_key` is assigned once, on
 * first sight of a `playhq_id`, and never changed on re-run. Existing
 * curated rows (loaded from the committed CSVs) are preserved verbatim;
 * only genuinely new clubs/aliases are appended.
 */
import { uniqueSlug } from '@/pipeline/fetch/keys';

// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
export type ClubRow = {
    club_key: string;
    name: string;
    established_year: string | null;
    home_venue: string | null;
    playhq_id: string | null;
};

// oxlint-disable-next-line typescript/consistent-type-definitions -- CSV row: interface has no implicit index signature, so it stops assigning to Record<string, CsvValue>
export type ClubAliasRow = {
    club_key: string;
    alias_text: string;
    source: string;
};

// `alias_text` is UNIQUE in the schema. When the same alias text is curated
// under more than one `source` (e.g. a club spans both the archive_pdf and
// playhq eras under an identical name), exactly one row may survive. The
// choice must be a pure function of the rows themselves, never of array/Map
// iteration order, so re-runs and hand-edits produce byte-identical output.
const SOURCE_PRECEDENCE: readonly string[] = ['archive_pdf', 'playhq'];

function sourceRank(source: string): number {
    const index = SOURCE_PRECEDENCE.indexOf(source);
    return index === -1 ? SOURCE_PRECEDENCE.length : index;
}

/**
 * Deduplicates alias rows by `alias_text`, keeping one row per alias. Ties
 * are broken deterministically by `SOURCE_PRECEDENCE` (earliest era wins),
 * then by `club_key` as a final tiebreaker.
 */
export function dedupeAliasesByText(
    rows: readonly ClubAliasRow[],
): ClubAliasRow[] {
    const bestByAlias = new Map<string, ClubAliasRow>();
    for (const row of rows) {
        const current = bestByAlias.get(row.alias_text);
        if (current === undefined) {
            bestByAlias.set(row.alias_text, row);
            continue;
        }
        const currentRank = sourceRank(current.source);
        const candidateRank = sourceRank(row.source);
        const candidateWins =
            candidateRank < currentRank ||
            (candidateRank === currentRank &&
                row.club_key.localeCompare(current.club_key) < 0);
        if (candidateWins) {
            bestByAlias.set(row.alias_text, row);
        }
    }
    return [...bestByAlias.values()];
}

export class ClubRegistry {
    private readonly clubs: Map<string, ClubRow>;
    private readonly byPlayhqId: Map<string, string>;
    private readonly aliases: Map<string, ClubAliasRow>;
    private readonly takenKeys: Set<string>;

    public constructor(
        existingClubs: readonly ClubRow[],
        existingAliases: readonly ClubAliasRow[],
    ) {
        this.clubs = new Map(
            existingClubs.map((club) => [club.club_key, club]),
        );
        this.byPlayhqId = new Map(
            existingClubs.flatMap((club) =>
                club.playhq_id === null
                    ? []
                    : [[club.playhq_id, club.club_key] as const],
            ),
        );
        this.aliases = new Map(
            dedupeAliasesByText(existingAliases).map((alias) => [
                alias.alias_text,
                alias,
            ]),
        );
        this.takenKeys = new Set(existingClubs.map((club) => club.club_key));
    }

    public resolve(organisationId: string, organisationName: string): string {
        const existing = this.byPlayhqId.get(organisationId);
        if (existing !== undefined) {
            // club_key/name stay curated and untouched, but a changed PlayHQ
            // display name is still worth recording as a new alias.
            this.addAlias(existing, organisationName, 'playhq');
            return existing;
        }

        const clubKey = uniqueSlug(organisationName, this.takenKeys);
        this.takenKeys.add(clubKey);
        this.byPlayhqId.set(organisationId, clubKey);
        this.clubs.set(clubKey, {
            club_key: clubKey,
            name: organisationName,
            established_year: null,
            home_venue: null,
            playhq_id: organisationId,
        });

        this.addAlias(clubKey, organisationName, 'playhq');
        return clubKey;
    }

    public addAlias(clubKey: string, aliasText: string, source: string): void {
        if (this.aliases.has(aliasText)) {
            return;
        }
        this.aliases.set(aliasText, {
            club_key: clubKey,
            alias_text: aliasText,
            source,
        });
    }

    public getClubs(): ClubRow[] {
        return [...this.clubs.values()].toSorted((a, b) =>
            a.club_key.localeCompare(b.club_key),
        );
    }

    public getAliases(): ClubAliasRow[] {
        return [...this.aliases.values()].toSorted((a, b) =>
            a.alias_text.localeCompare(b.alias_text),
        );
    }
}
