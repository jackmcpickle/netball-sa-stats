import { describe, expect, it } from 'vitest';
import { buildArchiveEntities } from '@/pipeline/archive/merge';

const aliases = [
    { alias_text: 'Contax', club_key: 'contax', source: 'playhq' },
    { alias_text: 'Walkerville', club_key: 'walkerville', source: 'playhq' },
] as const;

describe(buildArchiveEntities, () => {
    it('builds archive CSV rows with source flags, null stats and synthetic ids', () => {
        const entities = buildArchiveEntities({
            clubAliases: aliases,
            placements: [
                {
                    grades: [
                        {
                            gradeName: 'A1.',
                            teams: [
                                {
                                    ladderPosition: 1,
                                    squadNumber: null,
                                    teamName: 'Contax',
                                },
                                {
                                    ladderPosition: 2,
                                    squadNumber: 2,
                                    teamName: 'Walkerville',
                                },
                                {
                                    ladderPosition: 3,
                                    squadNumber: 3,
                                    teamName: 'Walkerville',
                                },
                                {
                                    ladderPosition: 4,
                                    squadNumber: 4,
                                    teamName: 'Walkerville',
                                },
                                {
                                    ladderPosition: 5,
                                    squadNumber: 5,
                                    teamName: 'Walkerville',
                                },
                            ],
                        },
                    ],
                    year: 2000,
                },
            ],
        });

        expect(entities.seasons).toStrictEqual([
            {
                competition_key: 'amnd',
                competition_period: 'winter',
                end_year: 2000,
                is_final: 1,
                label: 'Winter 2000',
                playhq_id: 'archive:amnd-winter-2000',
                season_key: 'amnd-winter-2000',
                source: 'archive_pdf',
                start_year: 2000,
                status: 'completed',
            },
        ]);
        expect(entities.grades).toStrictEqual([
            {
                age_band: 'Senior',
                division: null,
                grade_key: 'amnd-winter-2000-amnd-league',
                name: 'AMND League',
                playhq_id: 'archive:amnd-winter-2000:amnd-league',
                season_key: 'amnd-winter-2000',
                team_count: 5,
                tier: 3,
            },
        ]);
        expect(entities.teams).toHaveLength(5);
        expect(entities.teams[0]).toStrictEqual({
            club_key: 'contax',
            display_name: 'Contax',
            grade_key: 'amnd-winter-2000-amnd-league',
            playhq_id: 'archive:amnd-winter-2000:amnd-league:contax:none',
            squad_number: null,
        });
        expect(entities.teams[1]).toStrictEqual({
            club_key: 'walkerville',
            display_name: 'Walkerville',
            grade_key: 'amnd-winter-2000-amnd-league',
            playhq_id: 'archive:amnd-winter-2000:amnd-league:walkerville:2',
            squad_number: 2,
        });
        expect(entities.results[0]).toMatchObject({
            club_key: 'contax',
            grade_key: 'amnd-winter-2000-amnd-league',
            ladder_position: 1,
            notes: 'Archive PDF title: Final Placings',
            placement_basis: 'final_premiership_placings',
            position_uncertain: 1,
            source: 'archive_pdf',
        });
        expect(entities.results[0]?.played).toBeNull();
        expect(entities.results[4]).toMatchObject({
            ladder_position: 5,
            notes: 'Archive PDF title: Final Placings',
            position_uncertain: 0,
        });
    });
});
