/**
 * Club identity + curated club_aliases. `club_key` is assigned once, on
 * first sight of a `playhq_id`, and never changed on re-run. Existing
 * curated rows (loaded from the committed CSVs) are preserved verbatim;
 * only genuinely new clubs/aliases are appended.
 */
import { uniqueSlug } from '@/pipeline/fetch/keys';

export type ClubRow = {
    club_key: string;
    name: string;
    established_year: string | null;
    home_venue: string | null;
    playhq_id: string | null;
};

export type ClubAliasRow = {
    club_key: string;
    alias_text: string;
    source: string;
};

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
            existingAliases.map((alias) => [alias.alias_text, alias]),
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
        if (this.aliases.has(aliasText)) return;
        this.aliases.set(aliasText, {
            club_key: clubKey,
            alias_text: aliasText,
            source,
        });
    }

    public getClubs(): ClubRow[] {
        return [...this.clubs.values()].sort((a, b) =>
            a.club_key.localeCompare(b.club_key),
        );
    }

    public getAliases(): ClubAliasRow[] {
        return [...this.aliases.values()].sort((a, b) =>
            a.alias_text.localeCompare(b.alias_text),
        );
    }
}
