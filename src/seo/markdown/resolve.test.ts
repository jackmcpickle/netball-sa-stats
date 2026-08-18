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
                        grades: [
                            {
                                gradeKey: 'amnd-2024-a1',
                                name: 'A1',
                                results: [
                                    {
                                        clubKey: 'contax',
                                        clubName: 'Contax',
                                        displayName: 'Contax',
                                        goalsAgainst: 60,
                                        goalsFor: 80,
                                        ladderPosition: 1,
                                        lost: 0,
                                        played: 2,
                                        won: 2,
                                    },
                                    {
                                        clubKey: 'garville',
                                        clubName: 'Garville',
                                        displayName: 'Garville',
                                        goalsAgainst: 80,
                                        goalsFor: 60,
                                        ladderPosition: 2,
                                        lost: 2,
                                        played: 2,
                                        won: 0,
                                    },
                                ],
                                teamCount: 2,
                                tier: 1,
                            },
                        ],
                        isFinal: true,
                        seasonKey: 'amnd-2024',
                        startYear: 2024,
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
            away: 'garville',
            awayScore: 30,
            gradeKey: 'amnd-2024-a1',
            home: 'contax',
            homeScore: 40,
            round: 1,
        },
    ]);
    return db;
}

function url(path: string): URL {
    return new URL(path, 'https://netballsa.com');
}

describe(normalisePath, () => {
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

describe(renderMarkdown, () => {
    it('renders every advertised markdown path', async () => {
        const db = await seededDb();
        const bodies = await Promise.all(
            MARKDOWN_PATHS.map(async (path) => ({
                body: await renderMarkdown(db, url(path)),
                path,
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
        await expect(renderMarkdown(db, url('/ladders.md'))).resolves.toBe(
            await renderMarkdown(db, url('/ladders')),
        );
        await expect(renderMarkdown(db, url('/index.md'))).resolves.toBe(
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
        await expect(
            renderMarkdown(db, url('/clubs/nope.md')),
        ).resolves.toBeNull();
    });

    it('returns null for a path with no markdown twin', async () => {
        const db = await seededDb();
        await expect(renderMarkdown(db, url('/admin.md'))).resolves.toBeNull();
        await expect(
            renderMarkdown(db, url('/nothing-here.md')),
        ).resolves.toBeNull();
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

    it('renders the FAQ twin from the same builders as the HTML page', async () => {
        const db = await seededDb();
        const body = await renderMarkdown(db, url('/faq.md'));
        expect(body).toContain('# Common questions');
        expect(body).toContain(
            'What is the South Australian netball club championship?',
        );
        expect(body).toContain('## Frequently asked questions');
    });
});
