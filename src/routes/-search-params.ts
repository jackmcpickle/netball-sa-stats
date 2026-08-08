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
