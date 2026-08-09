import type { JSX, ReactNode } from 'react';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import type { ChartInteraction } from '@/components/charts/use-chart-interaction';

interface ChartFrameProps {
    readonly testId: string;
    readonly interaction: ChartInteraction;
    readonly children: ReactNode;
    readonly className?: string;
}

/** Relative frame that owns reveal state and the floating tooltip layer. */
export function ChartFrame({
    testId,
    interaction,
    children,
    className = '',
}: ChartFrameProps): JSX.Element {
    return (
        <div
            ref={interaction.frameRef}
            data-testid={testId}
            data-chart-frame=""
            className={`chart-frame relative ${className}`.trim()}
        >
            {children}
            <ChartTooltip
                hit={interaction.hit}
                id={interaction.tooltipId}
                tooltipRef={interaction.tooltipRef}
            />
        </div>
    );
}
