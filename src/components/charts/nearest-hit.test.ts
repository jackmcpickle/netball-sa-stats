import { describe, expect, it } from 'vitest';
import { nearestHit } from '@/components/charts/nearest-hit';
import type { ChartHit } from '@/components/charts/nearest-hit';

const HITS: readonly ChartHit[] = [
    {
        id: 'a-2023',
        label: 'Contax',
        detail: '2023 · #2',
        x: 100,
        y: 40,
    },
    {
        id: 'b-2023',
        label: 'Matrics',
        detail: '2023 · #1',
        x: 100,
        y: 20,
    },
    {
        id: 'a-2024',
        label: 'Contax',
        detail: '2024 · #3',
        x: 200,
        y: 60,
    },
];

describe(nearestHit, () => {
    it('returns the closest point within the max distance', () => {
        expect(nearestHit(HITS, 102, 22, 30)?.id).toBe('b-2023');
        expect(nearestHit(HITS, 198, 58, 30)?.id).toBe('a-2024');
    });

    it('returns null when nothing is close enough', () => {
        expect(nearestHit(HITS, 400, 400, 30)).toBeNull();
    });

    it('prefers a nearer point even when another shares the x', () => {
        expect(nearestHit(HITS, 100, 35, 40)?.label).toBe('Contax');
    });
});
