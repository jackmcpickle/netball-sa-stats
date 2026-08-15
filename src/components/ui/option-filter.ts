import { isUndefined } from 'es-toolkit';
/**
 * Filtering for the searchable select. Kept as plain functions so the matching
 * rules can be unit tested without a DOM.
 */

interface FilterableOption {
    readonly label: string;
    /** Secondary line, e.g. the competition a grade belongs to. */
    readonly hint?: string;
}

/**
 * Lowercase and collapse anything that is not a letter or digit to a single
 * space, so "Junior 4A" and "junior-4a" normalise to the same haystack.
 */
export function normaliseQuery(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Query words, in order typed. An empty query yields no terms. */
export function queryTerms(query: string): readonly string[] {
    const normalised = normaliseQuery(query);
    return normalised === '' ? [] : normalised.split(' ');
}

/**
 * An option matches when every typed term appears somewhere in its label or
 * its hint. Terms match on substrings, so "prem" finds "Premier Division" and
 * "junior 4" finds "Junior 4A" in the "Junior Competition" hint.
 */
export function matchesQuery(option: FilterableOption, query: string): boolean {
    const terms = queryTerms(query);
    if (terms.length === 0) {
        return true;
    }

    const haystack = normaliseQuery(
        isUndefined(option.hint)
            ? option.label
            : `${option.label} ${option.hint}`,
    );

    return terms.every((term) => haystack.includes(term));
}

/** Convenience wrapper used by tests and any non-Base-UI caller. */
export function filterOptions<Option extends FilterableOption>(
    options: readonly Option[],
    query: string,
): readonly Option[] {
    return options.filter((option) => matchesQuery(option, query));
}
