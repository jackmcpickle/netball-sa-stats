import { describe, expect, it } from 'vitest';
import type { ClubAliasRow, ClubRow } from '@/pipeline/fetch/club-registry';
import {
    ClubRegistry,
    dedupeAliasesByText,
} from '@/pipeline/fetch/club-registry';

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

    it('never emits two aliases with the same alias_text, even when curated input has a duplicate (the writer must dedupe, not just the schema)', () => {
        const duplicated: ClubAliasRow[] = [
            { club_key: 'matrics', alias_text: 'Matrics', source: 'playhq' },
            {
                club_key: 'matrics',
                alias_text: 'Matrics',
                source: 'archive_pdf',
            },
        ];
        const registry = new ClubRegistry(
            [
                {
                    club_key: 'matrics',
                    name: 'Matrics Netball Club',
                    established_year: null,
                    home_venue: null,
                    playhq_id: null,
                },
            ],
            duplicated,
        );

        const aliases = registry.getAliases();
        const aliasTexts = aliases.map((a) => a.alias_text);
        expect(aliasTexts).toEqual([...new Set(aliasTexts)]);
        expect(aliases).toHaveLength(1);
        // archive_pdf wins deterministically over playhq for a same-text tie.
        expect(aliases[0]?.source).toBe('archive_pdf');
    });

    it('resolving a PlayHQ alias that collides with an existing curated alias_text does not create a duplicate row', () => {
        const registry = new ClubRegistry(
            [
                {
                    club_key: 'matrics',
                    name: 'Matrics Netball Club',
                    established_year: null,
                    home_venue: null,
                    playhq_id: 'club-matrics-id',
                },
            ],
            [
                {
                    club_key: 'matrics',
                    alias_text: 'Matrics',
                    source: 'archive_pdf',
                },
            ],
        );

        registry.resolve('club-matrics-id', 'Matrics');

        const aliases = registry.getAliases();
        expect(aliases).toHaveLength(1);
        expect(aliases[0]).toEqual({
            club_key: 'matrics',
            alias_text: 'Matrics',
            source: 'archive_pdf',
        });
    });
});

describe('dedupeAliasesByText', () => {
    it('is a pure function of the rows, independent of input order', () => {
        const rows: ClubAliasRow[] = [
            { club_key: 'matrics', alias_text: 'Matrics', source: 'playhq' },
            {
                club_key: 'matrics',
                alias_text: 'Matrics',
                source: 'archive_pdf',
            },
        ];
        const reversed = [...rows].reverse();

        expect(dedupeAliasesByText(rows)).toEqual(
            dedupeAliasesByText(reversed),
        );
        expect(dedupeAliasesByText(rows)).toEqual([
            {
                club_key: 'matrics',
                alias_text: 'Matrics',
                source: 'archive_pdf',
            },
        ]);
    });

    it('leaves distinct alias_text rows untouched', () => {
        const rows: ClubAliasRow[] = [
            { club_key: 'a', alias_text: 'Alpha', source: 'playhq' },
            { club_key: 'b', alias_text: 'Beta', source: 'archive_pdf' },
        ];
        expect(dedupeAliasesByText(rows)).toEqual(rows);
    });
});
