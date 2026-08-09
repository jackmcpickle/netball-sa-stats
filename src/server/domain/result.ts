/**
 * A `Result` makes failure part of a function's return type instead of a
 * thrown exception a caller has to know to catch. Domain code returns these;
 * routes/loaders decide how to surface an `err` (empty state, 404, etc).
 */
export type Result<T, E> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
    return { ok: false, error };
}

export function map<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => U,
): Result<U, E> {
    return result.ok ? ok(fn(result.value)) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
    return result.ok ? result.value : fallback;
}

/** Shared domain failure vocabulary — routes map these to UI/HTTP outcomes. */
export type DomainError =
    | {
          readonly kind: 'not-found';
          readonly entity: 'club' | 'season' | 'grade';
          readonly key: string;
      }
    | { readonly kind: 'no-ranked-seasons' }
    | { readonly kind: 'empty-dataset' };
