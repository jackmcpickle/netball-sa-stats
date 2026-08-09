import type { JSX } from 'react';

interface NetballMarkProps {
    readonly className?: string;
}

/**
 * Netball icon by Made by Made from the Noun Project (#711313),
 * CC BY 3.0 — see footer attribution.
 *
 * Monoline ball: outer circle, equator, and two inward-bowing side arcs —
 * matching the Noun Project glyph, colored via `currentColor` (brand blue).
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
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle
                    cx="16"
                    cy="16"
                    r="13.1"
                />
                {/* Horizontal equator */}
                <path d="M2.9 16h26.2" />
                {/* Side arcs bowing inward toward centre */}
                <path d="M8.5 4.1c3.85 4.15 3.85 19.5 0 23.8" />
                <path d="M23.5 4.1c-3.85 4.15-3.85 19.5 0 23.8" />
            </g>
        </svg>
    );
}
