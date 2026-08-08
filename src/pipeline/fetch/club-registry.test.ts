import { describe, expect, it } from 'vitest';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import { ClubRegistry } from '@/pipeline/fetch/club-registry';

// Fixture data modelling a hand-curated `clubs.csv`/`club_aliases.csv` state,
// as produced by a prior fetch run and possibly touched up by a human (per
// the brief's curation-safety constraint).
const existingClubs: ClubRow[] = [
    {
        club_key: 'walkerville',
        name: 'Walkerville Netball Club',
        established_year: '1975',
        home_venue: 'Walkerville Oval',
        playhq_id: 'club-walkerville-id',
    },
];

const existingAliases: ClubAliasRow[] = [
    {
        club_key: 'walkerville',
        alias_text: 'Walkerville Netball Club',
        source: 'playhq',
    },
];

describe('ClubRegistry curation safety', () => {
    it('preserves existing club_key/name for a club whose PlayHQ display name changed, and appends the new spelling as an alias', () => {
        const registry = new ClubRegistry(existingClubs, existingAliases);

        const clubKey = registry.resolve(
            'club-walkerville-id',
            'Walkerville NC',
        );

        expect(clubKey).toBe('walkerville');

        const clubs = registry.getClubs();
        expect(clubs).toHaveLength(1);
        expect(clubs[0]).toEqual(existingClubs[0]);
        // established_year/home_venue/name are curated fields and must
        // survive verbatim, not be overwritten from the new PlayHQ name.
        expect(clubs[0]?.name).toBe('Walkerville Netball Club');
        expect(clubs[0]?.established_year).toBe('1975');

        const aliases = registry.getAliases();
        expect(aliases).toHaveLength(2);
        const newAlias = aliases.find((a) => a.alias_text === 'Walkerville NC');
        expect(newAlias).toEqual({
            club_key: 'walkerville',
            alias_text: 'Walkerville NC',
            source: 'playhq',
        });
    });

    it('assigns a fresh club_key for a genuinely new club', () => {
        const registry = new ClubRegistry(existingClubs, existingAliases);

        const clubKey = registry.resolve(
            'club-newtown-id',
            'Newtown Netball Club',
        );

        expect(clubKey).toBe('newtown-netball-club');
        expect(registry.getClubs()).toHaveLength(2);
        const newClub = registry
            .getClubs()
            .find((c) => c.club_key === 'newtown-netball-club');
        expect(newClub).toEqual({
            club_key: 'newtown-netball-club',
            name: 'Newtown Netball Club',
            established_year: null,
            home_venue: null,
            playhq_id: 'club-newtown-id',
        });
    });

    it('does not duplicate a club_key already claimed as a curated slug, appending a numeric suffix instead', () => {
        const clash: ClubRow[] = [
            {
                club_key: 'newtown-netball-club',
                name: 'Newtown Netball Club (original)',
                established_year: null,
                home_venue: null,
                playhq_id: 'other-playhq-id',
            },
        ];
        const registry = new ClubRegistry(clash, []);

        const clubKey = registry.resolve(
            'club-newtown-id',
            'Newtown Netball Club',
        );

        expect(clubKey).toBe('newtown-netball-club-2');
        expect(registry.getClubs()).toHaveLength(2);
    });
});
