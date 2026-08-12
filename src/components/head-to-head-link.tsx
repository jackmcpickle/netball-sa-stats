import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { JSX, ReactNode } from 'react';

/**
 * Wraps the head-to-head route's search params in a memo, for the same reason
 * `ClubLink` memoises its path params: a fresh object literal in JSX would
 * re-render every fixture row on every render.
 */
export function HeadToHeadLink({
    a,
    b,
    children,
    className = '',
}: {
    readonly a: string;
    readonly b: string;
    readonly children: ReactNode;
    readonly className?: string;
}): JSX.Element {
    const search = useMemo(() => ({ a, b }), [a, b]);
    return (
        <Link
            to="/head-to-head"
            search={search}
            className={className}
        >
            {children}
        </Link>
    );
}
