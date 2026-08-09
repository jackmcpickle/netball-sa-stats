import { z } from 'zod';
import {
    parseOptionalDirParam,
    parseOptionalIntParam,
} from '@/routes/-search-params';

/**
 * Shared by every paginated route so sort/page URLs read the same everywhere.
 * Values are only shape-checked here; `resolveTableState` does the allow-list
 * validation server-side, because the allow-list is per-table.
 */
export const tableSearchSchema = z.object({
    sort: z.string().optional(),
    dir: z.preprocess(
        parseOptionalDirParam,
        z.enum(['asc', 'desc']).optional(),
    ),
    page: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
    pageSize: z.preprocess(parseOptionalIntParam, z.number().int().optional()),
});

export type TableSearch = z.infer<typeof tableSearchSchema>;

export function tableSearchDeps(search: TableSearch): TableSearch {
    return {
        sort: search.sort,
        dir: search.dir,
        page: search.page,
        pageSize: search.pageSize,
    };
}
