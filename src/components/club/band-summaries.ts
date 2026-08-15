/**
 * Per-band trend figures for the club sparkline grid. Kept out of the
 * component module so that file exports components only.
 */
import { round } from '@/components/charts/scale';
import type {
    ClubBandTrend,
    ClubTrendPoint,
} from '@/server/dto/club-profile.dto';

/**
 * Mean of a window of measured seasons. Comparing single endpoints lets one
 * fluke season (a debut last place, say) read as a dramatic swing, so both
 * ends of the trend are averaged over up to three seasons instead. Bands
 * with fewer than six measured seasons let the windows overlap — still more
 * robust than a two-point comparison.
 */
function windowMean(points: readonly ClubTrendPoint[]): number {
    const total = points.reduce((sum, point) => sum + (point.strength ?? 0), 0);
    return total / points.length;
}

export type BandSummary = {
    readonly tier: number;
    readonly label: string;
    readonly points: readonly ClubTrendPoint[];
    readonly measured: readonly ClubTrendPoint[];
    readonly latest: ClubTrendPoint;
    readonly first: ClubTrendPoint;
    readonly change: number | null;
    readonly windowSize: number;
};

/**
 * Words the number of seasons averaged into each end of the change figure
 * ("its first season" / "its first two measured seasons" / "its first three
 * measured seasons") so the caption never claims a window wider than what
 * was actually available.
 */
export function windowSizeLabel(windowSize: number): string {
    if (windowSize === 1) {
        return 'its first season';
    }
    if (windowSize === 2) {
        return 'its first two measured seasons';
    }
    return 'its first three measured seasons';
}

/**
 * Drop the bands the club never got a measurable result in, and precompute the
 * figures each cell prints. Tier order is set upstream (strongest first) and is
 * preserved here.
 */
export function bandSummaries(
    bands: readonly ClubBandTrend[],
): readonly BandSummary[] {
    return bands.flatMap((band): BandSummary[] => {
        const measured = band.points.filter((point) => point.strength !== null);
        const latest = measured.at(-1);
        const [first] = measured;
        if (!latest || !first) {
            return [];
        }
        const windowSize = Math.min(3, measured.length - 1);
        const startWindow = measured.slice(0, windowSize);
        const endWindow = measured.slice(measured.length - windowSize);
        return [
            {
                tier: band.tier,
                label: band.label,
                points: band.points,
                measured,
                latest,
                first,
                change:
                    measured.length > 1
                        ? round(
                              windowMean(endWindow) - windowMean(startWindow),
                              3,
                          )
                        : null,
                windowSize,
            },
        ];
    });
}
