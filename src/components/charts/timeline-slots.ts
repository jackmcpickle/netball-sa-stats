/**
 * Expand ranked years into chart slots, inserting gap markers where the
 * calendar is missing seasons so a continuous bar/line cannot imply coverage.
 */

export type TimelineSlot =
    | { readonly kind: 'year'; readonly year: number }
    | {
          readonly kind: 'gap';
          readonly afterYear: number;
          readonly missingYears: readonly number[];
      };

export function timelineSlots(
    rankedYears: readonly number[],
): readonly TimelineSlot[] {
    const slots: TimelineSlot[] = [];
    for (let i = 0; i < rankedYears.length; i += 1) {
        const year = rankedYears[i];
        if (year === undefined) continue;
        if (i > 0) {
            const prev = rankedYears[i - 1];
            if (prev !== undefined && year - prev > 1) {
                const missing: number[] = [];
                for (
                    let missingYear = prev + 1;
                    missingYear < year;
                    missingYear += 1
                ) {
                    missing.push(missingYear);
                }
                slots.push({
                    kind: 'gap',
                    afterYear: prev,
                    missingYears: missing,
                });
            }
        }
        slots.push({ kind: 'year', year });
    }
    return slots;
}

export function gapLabel(missingYears: readonly number[]): string {
    if (missingYears.length === 0) return '';
    if (missingYears.length === 1) return String(missingYears[0]);
    return `${String(missingYears[0])}–${String(missingYears.at(-1))}`;
}
