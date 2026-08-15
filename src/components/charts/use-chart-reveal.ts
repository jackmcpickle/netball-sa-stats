import { useCallback } from 'react';
import type { RefCallback } from 'react';

/**
 * Marks a chart root with `data-revealed="true"` the first time it intersects
 * the viewport, so CSS can draw lines and grow bars. Reduced-motion users get
 * the revealed state immediately — no waiting on scroll.
 */
export function useChartReveal(): RefCallback<HTMLElement> {
    return useCallback<RefCallback<HTMLElement>>((node) => {
        if (!node) {
            return;
        }

        if (
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            node.dataset.revealed = 'true';
            return;
        }

        // Already on screen (e.g. short pages): reveal without waiting for a
        // scroll event that may never come.
        const initial = node.getBoundingClientRect();
        const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight;
        if (initial.top < viewportHeight * 0.9 && initial.bottom > 0) {
            node.dataset.revealed = 'true';
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) {
                    return;
                }
                node.dataset.revealed = 'true';
                observer.disconnect();
            },
            { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
        );
        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, []);
}
