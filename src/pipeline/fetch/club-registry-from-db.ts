/**
 * Loads curated club identity from D1 (or the sqlite test executor) into a
 * `ClubRegistry`. Aliases live on `club_id`, so a JOIN recovers `club_key`.
 */
import { ClubRegistry } from '@/pipeline/fetch/club-registry';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import type { ImportExecutor } from '@/pipeline/import/types';

function cellText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    return '';
}

function emptyToNull(value: unknown): string | null {
    const text = cellText(value);
    return text === '' ? null : text;
}

function toClubRow(row: Record<string, unknown>): ClubRow {
    return {
        club_key: cellText(row.club_key),
        established_year: emptyToNull(row.established_year),
        home_venue: emptyToNull(row.home_venue),
        name: cellText(row.name),
        playhq_id: emptyToNull(row.playhq_id),
    };
}

function toAliasRow(row: Record<string, unknown>): ClubAliasRow {
    return {
        alias_text: cellText(row.alias_text),
        club_key: cellText(row.club_key),
        source: cellText(row.source),
    };
}

export async function clubRegistryFromExecutor(
    queryAll: ImportExecutor['queryAll'],
): Promise<ClubRegistry> {
    const clubRows = await queryAll(
        'SELECT club_key, name, established_year, home_venue, playhq_id FROM clubs;',
    );
    const clubs = clubRows.map(toClubRow);
    const aliasRows = await queryAll(`
            SELECT c.club_key AS club_key, a.alias_text AS alias_text, a.source AS source
            FROM club_aliases a
            JOIN clubs c ON c.id = a.club_id;
        `);
    const aliases = aliasRows.map(toAliasRow);
    return new ClubRegistry(clubs, aliases);
}
