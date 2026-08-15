import type { JSX } from 'react';

interface NetballMarkProps {
    readonly className?: string;
}

/**
 * Netball icon by Made by Made from the Noun Project (#711313),
 * CC BY 3.0 — see footer attribution.
 *
 * Monoline ball: outer circle plus three inward-bowing panel seams at 120°,
 * the netball panel pinwheel. (An equator with two side arcs reads as a
 * basketball.) Colored via `currentColor` (brand blue).
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
                {/* Panel seams: same arc, rotated 120° apart */}
                <path d="M4.66 9.45Q16 12.55 27.34 9.45" />
                <path
                    d="M4.66 9.45Q16 12.55 27.34 9.45"
                    transform="rotate(120 16 16)"
                />
                <path
                    d="M4.66 9.45Q16 12.55 27.34 9.45"
                    transform="rotate(240 16 16)"
                />
            </g>
        </svg>
    );
}
