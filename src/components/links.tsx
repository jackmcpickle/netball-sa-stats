import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { JSX, ReactNode } from 'react';

/**
 * Wraps the club route's path params in a memo. Route params are objects, and
 * a fresh object literal in JSX would re-render every row on every render.
 */
export function LeagueLink({
    competitionKey,
    children,
    className = '',
}: {
    readonly competitionKey: string;
    readonly children: ReactNode;
    readonly className?: string;
}): JSX.Element {
    const params = useMemo(
        () => ({ competitionKey }),
        [competitionKey],
    );
    return (
        <Link
            to="/leagues/$competitionKey"
            params={params}
            className={className}
        >
            {children}
        </Link>
    );
}

export function ClubLink({
    clubKey,
    children,
    className = '',
}: {
    readonly clubKey: string;
    readonly children: ReactNode;
    readonly className?: string;
}): JSX.Element {
    const params = useMemo(() => ({ clubKey }), [clubKey]);
    return (
        <Link
            to="/clubs/$clubKey"
            params={params}
            className={className}
        >
            {children}
        </Link>
    );
}
