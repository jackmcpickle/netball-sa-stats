/**
 * Coerces an optional search-param value to an integer, treating anything
 * unparseable (NaN, empty string, out-of-range hints) as absent rather than
 * throwing. Route loaders fall back to a sensible default when this returns
 * `undefined`, so a garbage query string never produces a 500.
 */
export function parseOptionalIntParam(value: unknown): number | undefined {
    if (value === undefined || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Coerces an optional search-param value to a sort direction, treating
 * anything unrecognised as absent rather than throwing. Route loaders fall
 * back to a table's default direction when this returns `undefined`, so a
 * query string like `?dir=x` never produces a 500.
 */
export function parseOptionalDirParam(
    value: unknown,
): 'asc' | 'desc' | undefined {
    return value === 'asc' || value === 'desc' ? value : undefined;
}

/**
 * Coerces an optional search-param value to a boolean, treating anything
 * unrecognised (garbage strings, empty string) as absent rather than
 * silently truthy. Route loaders fall back to a sensible default when this
 * returns `undefined`, so a query string like `?includePast=yes` never
 * flips the filter on.
 */
export function parseOptionalBoolParam(value: unknown): boolean | undefined {
    if (value === true || value === 'true' || value === '1') {
        return true;
    }
    if (value === false || value === 'false' || value === '0') {
        return false;
    }
    return undefined;
}
