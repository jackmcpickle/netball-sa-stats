import {
    useCallback,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react';
import {
    nearestHit,
    pointerToSvgPoint,
    type ChartHit,
} from '@/components/charts/nearest-hit';
import { useChartReveal } from '@/components/charts/use-chart-reveal';

function placeTooltip(
    frame: HTMLElement,
    tooltip: HTMLElement,
    clientX: number,
    clientY: number,
): void {
    const frameBox = frame.getBoundingClientRect();
    const tipBox = tooltip.getBoundingClientRect();
    const offset = 14;
    let left = clientX - frameBox.left + offset;
    let top = clientY - frameBox.top - Math.max(tipBox.height, 40) - 8;

    const maxLeft = Math.max(
        8,
        frameBox.width - Math.max(tipBox.width, 120) - 8,
    );
    const maxTop = Math.max(
        8,
        frameBox.height - Math.max(tipBox.height, 40) - 8,
    );
    left = Math.min(Math.max(8, left), maxLeft);
    top = Math.min(Math.max(8, top), maxTop);

    // Direct DOM write avoids the forbidden React `style` prop while still
    // tracking the pointer frame-by-frame.
    tooltip.style.transform = `translate(${String(left)}px, ${String(top)}px)`;
}

interface UseChartInteractionOptions {
    readonly hits: readonly ChartHit[];
    /** Max distance in SVG viewBox units. */
    readonly maxDistance: number;
}

export interface ChartInteraction {
    readonly frameRef: (node: HTMLElement | null) => (() => void) | undefined;
    readonly svgRef: RefObject<SVGSVGElement | null>;
    readonly tooltipRef: (node: HTMLDivElement | null) => void;
    readonly hit: ChartHit | null;
    readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    readonly onPointerLeave: () => void;
    readonly tooltipId: string;
}

/**
 * Scroll-reveal + nearest-point tooltip for a chart frame. The tooltip follows
 * the pointer; reveal is a one-shot IntersectionObserver on the frame.
 */
export function useChartInteraction({
    hits,
    maxDistance,
}: UseChartInteractionOptions): ChartInteraction {
    const revealRef = useChartReveal();
    const frameNodeRef = useRef<HTMLElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const tooltipNodeRef = useRef<HTMLDivElement | null>(null);
    const pointerRef = useRef<{ x: number; y: number } | null>(null);
    const [hit, setHit] = useState<ChartHit | null>(null);
    const tooltipId = useId();

    const frameRef = useCallback(
        (node: HTMLElement | null): (() => void) | undefined => {
            frameNodeRef.current = node;
            return revealRef(node) ?? undefined;
        },
        [revealRef],
    );

    const tooltipRef = useCallback((node: HTMLDivElement | null) => {
        tooltipNodeRef.current = node;
    }, []);

    useLayoutEffect(() => {
        const frame = frameNodeRef.current;
        const tip = tooltipNodeRef.current;
        const pointer = pointerRef.current;
        if (!frame || !tip || !pointer || !hit) return;
        placeTooltip(frame, tip, pointer.x, pointer.y);
    }, [hit]);

    const onPointerMove = useCallback(
        (event: ReactPointerEvent<SVGSVGElement>) => {
            const svg = svgRef.current ?? event.currentTarget;
            const frame = frameNodeRef.current;
            if (!frame) return;

            pointerRef.current = { x: event.clientX, y: event.clientY };
            const local = pointerToSvgPoint(svg, event.clientX, event.clientY);
            if (!local) {
                setHit(null);
                return;
            }

            const next = nearestHit(hits, local.x, local.y, maxDistance);
            setHit((previous) => {
                if (previous?.id === next?.id) return previous;
                return next;
            });

            const tip = tooltipNodeRef.current;
            if (next && tip) {
                placeTooltip(frame, tip, event.clientX, event.clientY);
            }
        },
        [hits, maxDistance],
    );

    const onPointerLeave = useCallback(() => {
        pointerRef.current = null;
        setHit(null);
    }, []);

    return {
        frameRef,
        svgRef,
        tooltipRef,
        hit,
        onPointerMove,
        onPointerLeave,
        tooltipId,
    };
}
