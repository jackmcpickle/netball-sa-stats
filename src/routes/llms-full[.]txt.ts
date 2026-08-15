import { createFileRoute } from '@tanstack/react-router';
import { getDb } from '@/db';
import { llmsFullTxt } from '@/seo/agent-files';
import { MARKDOWN_PATHS, renderMarkdown } from '@/seo/markdown/resolve';
import { absoluteUrl } from '@/seo/site';

export const Route = createFileRoute('/llms-full.txt')({
    server: {
        handlers: {
            GET: async () => {
                const db = getDb();
                const rendered = await Promise.all(
                    MARKDOWN_PATHS.map(
                        async (path) =>
                            await renderMarkdown(
                                db,
                                new URL(absoluteUrl(path)),
                            ),
                    ),
                );
                const documents = rendered.filter(
                    (document) => document !== null,
                );
                return new Response(llmsFullTxt(documents), {
                    headers: {
                        'content-type': 'text/plain; charset=utf-8',
                        'cache-control': 'public, max-age=900',
                    },
                });
            },
        },
    },
});
