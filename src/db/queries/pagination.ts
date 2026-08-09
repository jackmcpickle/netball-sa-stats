export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface TableState {
    readonly sort: string;
    readonly desc: boolean;
    readonly page: number;
    readonly pageSize: number;
}

export interface RawTableState {
    readonly sort?: string;
    readonly dir?: string;
    readonly page?: number;
    readonly pageSize?: number;
}

export interface TableSpec {
    /** Column ids that may reach `orderBy`. Anything else falls back. */
    readonly sortable: readonly string[];
    readonly defaultSort: string;
    readonly defaultDesc: boolean;
}
