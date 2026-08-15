/**
 * Every route that claims a markdown twin must actually produce one, with the
 * right shape: front matter, an H1, and no leaked `undefined`/`[object
 * Object]` from a renderer reading a field the DTO does not have.
 */
import { describe, expect, it } from 'vitest';
import type { Db } from '@/db';
import {
    MARKDOWN_PATHS,
    normalisePath,
    renderMarkdown,
} from '@/seo/markdown/resolve';
import type { SeedSpec } from '@/server/testing/fixtures';
import { seed, seedGames } from '@/server/testing/fixtures';
import { createTestDb } from '@/server/testing/harness';

function spec(): SeedSpec {
    return {
        competitions: [
            {
                key: 'amnd',
                name: 'AMND',
                seasons: [
                    {
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
                        isFinal: true,
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                tier: 1,
                                teamCount: 2,
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        ladderPosition: 1,
                                        played: 2,
                                        won: 2,
                                        lost: 0,
                                        goalsFor: 80,
                                        goalsAgainst: 60,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        ladderPosition: 2,
                                        played: 2,
                                        won: 0,
                                        lost: 2,
                                        goalsFor: 60,
                                        goalsAgainst: 80,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

async function seededDb(): Promise<Db> {
    const db = createTestDb();
    const seeded = await seed(db, spec());
    await seedGames(db, seeded, [
        {
            gradeKey: 'amnd-2024-a1',
            home: 'contax',
            away: 'garville',
            round: 1,
            homeScore: 40,
            awayScore: 30,
        },
    ]);
    return db;
}

function url(path: string): URL {
    return new URL(path, 'https://netballsa.com');
}

describe('normalisePath', () => {
    it.each([
        ['/index.md', '/'],
        ['/', '/'],
        ['/ladders.md', '/ladders'],
        ['/ladders/', '/ladders'],
        ['/clubs/contax.md', '/clubs/contax'],
        ['/method', '/method'],
    ])('maps %s to %s', (input, expected) => {
        expect(normalisePath(input)).toBe(expected);
    });
});

describe('renderMarkdown', () => {
    it('renders every advertised markdown path', async () => {
        const db = await seededDb();
        const bodies = await Promise.all(
            MARKDOWN_PATHS.map(async (path) => ({
                path,
                body: await renderMarkdown(db, url(path)),
            })),
        );
        for (const { path, body } of bodies) {
            expect(body, `no markdown for ${path}`).toBeTypeOf('string');
            expect(body).toMatch(/^---\n/u);
            expect(body).toContain('\n# ');
            expect(body).not.toContain('undefined');
            expect(body).not.toContain('[object Object]');
        }
    });

    it('renders the same body for a path and its .md twin', async () => {
        const db = await seededDb();
        expect(await renderMarkdown(db, url('/ladders.md'))).toBe(
            await renderMarkdown(db, url('/ladders')),
        );
        expect(await renderMarkdown(db, url('/index.md'))).toBe(
            await renderMarkdown(db, url('/')),
        );
    });

    it('renders a club profile with its own name and summary table', async () => {
        const db = await seededDb();
        const body = await renderMarkdown(db, url('/clubs/contax.md'));
        expect(body).toContain('# Contax');
        expect(body).toContain('## Summary');
        expect(body).toContain('Career championship points');
    });

    it('returns null for a club that does not exist', async () => {
        const db = await seededDb();
        expect(await renderMarkdown(db, url('/clubs/nope.md'))).toBeNull();
    });

    it('returns null for a path with no markdown twin', async () => {
        const db = await seededDb();
        expect(await renderMarkdown(db, url('/admin.md'))).toBeNull();
        expect(await renderMarkdown(db, url('/nothing-here.md'))).toBeNull();
    });

    it('honours query parameters on the ladders twin', async () => {
        const db = await seededDb();
        const body = await renderMarkdown(
            db,
            url('/ladders.md?year=2024&grade=amnd-2024-a1'),
        );
        expect(body).toContain('A1');
        expect(body).toContain('Contax');
    });

    it('carries the head-to-head record when both clubs are named', async () => {
        const db = await seededDb();
        const body = await renderMarkdown(
            db,
            url('/head-to-head.md?a=contax&b=garville'),
        );
        expect(body).toContain('Contax vs Garville');
        expect(body).toContain('### Meetings');
    });

    it('tells an agent how to select two clubs when none are named', async () => {
        const db = await seededDb();
        const body = await renderMarkdown(db, url('/head-to-head.md'));
        expect(body).toContain('?a=CLUB_KEY&b=CLUB_KEY');
    });
});
