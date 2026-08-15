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
    return { error, ok: false };
}

/** Shared domain failure vocabulary — routes map these to UI/HTTP outcomes. */
export type DomainError =
    | {
          readonly kind: 'not-found';
          readonly entity: 'club' | 'season' | 'grade';
          readonly key: string;
      }
    | { readonly kind: 'no-ranked-seasons' };
