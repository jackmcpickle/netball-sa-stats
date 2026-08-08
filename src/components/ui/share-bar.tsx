import type { JSX } from 'react';

const BAR_WIDTH = 96;

/**
 * Share-of-leader bar. Drawn as SVG so the width can be data-driven: the lint
 * rules ban inline style objects, and an attribute-driven rect is cleaner
 * anyway.
 *
 * Decorative: the figure it visualises is always in an adjacent cell.
 */
export function ShareBar({
    share,
    accent,
}: {
    readonly share: number;
    readonly accent: string;
}): JSX.Element {
    return (
        <svg
            viewBox={`0 0 ${String(BAR_WIDTH)} 8`}
            aria-hidden="true"
            className={`h-2 w-24 shrink-0 ${accent}`}
        >
            <rect
                width={BAR_WIDTH}
                height="8"
                rx="4"
                className="fill-rule-soft"
            />
            <rect
                width={Math.max(2, share * BAR_WIDTH)}
                height="8"
                rx="4"
                fill="currentColor"
            />
        </svg>
    );
}
