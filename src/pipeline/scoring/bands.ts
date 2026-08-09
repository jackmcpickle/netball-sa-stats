import { BANDS } from '@/pipeline/seed/catalogue';

const LABELS = new Map<number, string>(
    BANDS.map((band) => [band.tier, band.label]),
);

/** Divisions collapse: Primary 1 and Primary 2 are both "Primary". */
export function bandLabel(tier: number): string {
    return LABELS.get(tier) ?? `Tier ${String(tier)}`;
}
