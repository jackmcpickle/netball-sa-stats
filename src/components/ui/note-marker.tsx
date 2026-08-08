import type { JSX } from 'react';

/**
 * Small, unobtrusive marker for a result row with a provenance note (e.g.
 * PlayHQ's published `played` count not reconciling with won+drawn+lost).
 * Site posture is "free to check", so this stays visible rather than hidden
 * in a tooltip only — `title` covers pointer users, the visually-hidden span
 * covers screen readers.
 */
export function NoteMarker({ note }: { readonly note: string }): JSX.Element {
    return (
        <span
            className="ml-1 cursor-help align-super text-[11px] text-ink-muted"
            title={note}
        >
            <span aria-hidden="true">{'*'}</span>
            <span className="sr-only">{` (source note: ${note})`}</span>
        </span>
    );
}
