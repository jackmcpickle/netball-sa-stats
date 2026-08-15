import { describe, expect, it } from 'vitest';
import { buildArchiveEntities } from '@/pipeline/archive/merge';

const aliases = [
    { club_key: 'contax', alias_text: 'Contax', source: 'playhq' },
    { club_key: 'walkerville', alias_text: 'Walkerville', source: 'playhq' },
] as const;

describe(buildArchiveEntities, () => {
    it('builds archive CSV rows with source flags, null stats and synthetic ids', () => {
        const entities = buildArchiveEntities({
            placements: [
                {
                    year: 2000,
                    grades: [
                        {
                            gradeName: 'A1.',
                            teams: [
                                {
                                    ladderPosition: 1,
                                    teamName: 'Contax',
                                    squadNumber: null,
                                },
                                {
                                    ladderPosition: 2,
                                    teamName: 'Walkerville',
                                    squadNumber: 2,
                                },
                                {
                                    ladderPosition: 3,
                                    teamName: 'Walkerville',
                                    squadNumber: 3,
                                },
                                {
                                    ladderPosition: 4,
                                    teamName: 'Walkerville',
                                    squadNumber: 4,
                                },
                                {
                                    ladderPosition: 5,
                                    teamName: 'Walkerville',
                                    squadNumber: 5,
                                },
                            ],
                        },
                    ],
                },
            ],
            clubAliases: aliases,
        });

        expect(entities.seasons).toStrictEqual([
            {
                competition_key: 'amnd',
                season_key: 'amnd-winter-2000',
                competition_period: 'winter',
                label: 'Winter 2000',
                start_year: 2000,
                end_year: 2000,
                is_final: 1,
                playhq_id: 'archive:amnd-winter-2000',
                source: 'archive_pdf',
                status: 'completed',
            },
        ]);
        expect(entities.grades).toStrictEqual([
            {
                season_key: 'amnd-winter-2000',
                grade_key: 'amnd-winter-2000-amnd-league',
                name: 'AMND League',
                tier: 3,
                division: null,
                team_count: 5,
                age_band: 'Senior',
                playhq_id: 'archive:amnd-winter-2000:amnd-league',
            },
        ]);
        expect(entities.teams).toHaveLength(5);
        expect(entities.teams[0]).toStrictEqual({
            club_key: 'contax',
            grade_key: 'amnd-winter-2000-amnd-league',
            display_name: 'Contax',
            squad_number: null,
            playhq_id: 'archive:amnd-winter-2000:amnd-league:contax:none',
        });
        expect(entities.teams[1]).toStrictEqual({
            club_key: 'walkerville',
            grade_key: 'amnd-winter-2000-amnd-league',
            display_name: 'Walkerville',
            squad_number: 2,
            playhq_id: 'archive:amnd-winter-2000:amnd-league:walkerville:2',
        });
        expect(entities.results[0]).toMatchObject({
            grade_key: 'amnd-winter-2000-amnd-league',
            club_key: 'contax',
            ladder_position: 1,
            position_uncertain: 1,
            source: 'archive_pdf',
            placement_basis: 'final_premiership_placings',
            notes: 'Archive PDF title: Final Placings',
        });
        expect(entities.results[0]?.played).toBeNull();
        expect(entities.results[4]).toMatchObject({
            ladder_position: 5,
            position_uncertain: 0,
            notes: 'Archive PDF title: Final Placings',
        });
    });
});
