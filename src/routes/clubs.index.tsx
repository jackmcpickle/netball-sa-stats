import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ClubIndexPage } from '@/components/club/club-index-page';
import { getDb } from '@/db';
import { parseOptionalBoolParam } from '@/routes/-search-params';
import { createServices, resolvePageResult } from '@/server/container';

export type {
    ClubIndexEntry,
    ClubIndexPageDto as ClubIndexData,
} from '@/server/dto/clubs.dto';

const searchSchema = z.object({
    includePast: z.preprocess(parseOptionalBoolParam, z.boolean().optional()),
});

const loadClubs = createServerFn({ method: 'GET' })
    .validator(z.object({ includePast: z.boolean().optional() }))
    .handler(async ({ data }) => {
        return resolvePageResult(
            await createServices(getDb()).clubs.getIndexPage(data),
        );
    });

export const Route = createFileRoute('/clubs/')({
    validateSearch: searchSchema,
    loaderDeps: ({ search }) => ({ includePast: search.includePast }),
    loader: async ({ deps }) =>
        loadClubs({ data: { includePast: deps.includePast } }),
    component: ClubIndexPage,
});
