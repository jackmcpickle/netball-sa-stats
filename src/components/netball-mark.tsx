import type { JSX } from 'react';

interface NetballMarkProps {
    readonly className?: string;
}

/**
 * Netball icon by Made by Made from the Noun Project (#711313),
 * CC BY 3.0 — see footer attribution.
 */
export function NetballMark({ className }: NetballMarkProps): JSX.Element {
    return (
        <svg
            viewBox="0 0 32 32"
            className={className}
            aria-hidden="true"
            focusable="false"
            fill="none"
        >
            <g
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle
                    cx="16"
                    cy="16"
                    r="13.2"
                />
                {/* Horizontal equator */}
                <path d="M2.8 16h26.4" />
                {/* Side arcs bowing inward toward centre */}
                <path d="M8.6 4c3.8 4.2 3.8 19.6 0 23.8" />
                <path d="M23.4 4c-3.8 4.2-3.8 19.6 0 23.8" />
            </g>
        </svg>
    );
}
