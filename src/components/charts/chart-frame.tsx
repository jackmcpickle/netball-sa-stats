import type { JSX, ReactNode } from 'react';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import type { ChartHit } from '@/components/charts/nearest-hit';

interface ChartFrameProps {
    readonly testId: string;
    readonly frameRef: (node: HTMLElement | null) => (() => void) | undefined;
    readonly hit: ChartHit | null;
    readonly tooltipId: string;
    readonly tooltipRef: (node: HTMLDivElement | null) => void;
    readonly children: ReactNode;
    readonly className?: string;
}

/** Relative frame that owns reveal state and the floating tooltip layer. */
export function ChartFrame({
    testId,
    frameRef,
    hit,
    tooltipId,
    tooltipRef,
    children,
    className = '',
}: ChartFrameProps): JSX.Element {
    return (
        <div
            ref={frameRef}
            data-testid={testId}
            data-chart-frame=""
            className={`chart-frame relative ${className}`.trim()}
        >
            {children}
            <ChartTooltip
                hit={hit}
                id={tooltipId}
                tooltipRef={tooltipRef}
            />
        </div>
    );
}
