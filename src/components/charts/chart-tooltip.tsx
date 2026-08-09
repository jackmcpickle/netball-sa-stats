import type { JSX } from 'react';
import type { ChartHit } from '@/components/charts/nearest-hit';

interface ChartTooltipProps {
    readonly hit: ChartHit | null;
    readonly id: string;
    readonly tooltipRef: (node: HTMLDivElement | null) => void;
}

/** Floating tip that tracks the pointer; content is inert for assistive tech. */
export function ChartTooltip({
    hit,
    id,
    tooltipRef,
}: ChartTooltipProps): JSX.Element {
    return (
        <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            data-chart-tooltip=""
            data-testid="chart-tooltip"
            data-visible={hit ? 'true' : 'false'}
            className="chart-tooltip pointer-events-none absolute top-0 left-0 z-10 min-w-[7.5rem] rounded-field bg-ink px-3 py-2 text-left text-paper shadow-sm"
        >
            {hit ? (
                <>
                    <div className="text-[13px] font-medium tracking-tight">
                        {hit.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-paper/75">
                        {hit.detail}
                    </div>
                </>
            ) : null}
        </div>
    );
}
