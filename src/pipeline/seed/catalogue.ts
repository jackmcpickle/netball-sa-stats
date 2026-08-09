/**
 * The competition catalogue and the grade-weight defaults.
 *
 * Weights are generated from `base - (division - 1) * step` rather than 40 hand-typed
 * numbers, so a band can be retuned in one place. Rows stay individually editable in
 * D1 afterwards — scoring reads the table, not this file.
 */

export type CompetitionSeed = {
    key: string;
    name: string;
    playhqOrgId: string | null;
    /** False for competitions seeded for shape only, with no data yet. */
    hasData: boolean;
};

export const COMPETITION_SEEDS: readonly CompetitionSeed[] = [
    {
        key: 'amnd',
        name: 'Adelaide Metropolitan Netball Division',
        playhqOrgId: '7a5f35e1',
        hasData: true,
    },
    {
        key: 'premier_league',
        name: 'Netball SA Premier League',
        playhqOrgId: '6fefc037',
        hasData: true,
    },
    {
        key: 'premier_league_reserves',
        name: 'Premier League Reserves',
        playhqOrgId: '6fefc037',
        hasData: true,
    },
    {
        key: 'city_night_division',
        name: 'City Night Division',
        playhqOrgId: null,
        hasData: false,
    },
    {
        key: 'super_league',
        name: 'Super League',
        playhqOrgId: null,
        hasData: false,
    },
    { key: 'juniors', name: 'Juniors', playhqOrgId: null, hasData: false },
];

type Band = {
    competitionKey: string;
    tier: number;
    label: string;
    base: number;
    /** Per-division decrement. Omitted for single-grade bands. */
    step?: number;
    divisions?: number;
    /** Divisions that never existed, e.g. AMND ran C.1–C.4 and C.6 but no C.5. */
    skip?: readonly number[];
};

/**
 * Ordering notes for the two contentious calls:
 * - Reserves (0.80) sits above AMND League (0.75): a Premier club's second string
 *   outranks the best metro club.
 * - C sits below Inter. The archived AMND regrading PDFs show two-way promotion and
 *   relegation between B.5 and C.1, so C is a normal competitive band, just lower.
 */
export const BANDS: readonly Band[] = [
    {
        competitionKey: 'premier_league',
        tier: 1,
        label: 'Premier Division',
        base: 1.0,
    },
    {
        competitionKey: 'premier_league_reserves',
        tier: 2,
        label: 'Reserves Division',
        base: 0.8,
    },
    { competitionKey: 'amnd', tier: 3, label: 'AMND League', base: 0.75 },
    { competitionKey: 'amnd', tier: 4, label: 'A. Grade', base: 0.68 },
    {
        competitionKey: 'amnd',
        tier: 5,
        label: 'B',
        base: 0.62,
        step: 0.03,
        divisions: 6,
    },
    {
        competitionKey: 'amnd',
        tier: 6,
        label: 'Inter.',
        base: 0.45,
        // 0.015, not 0.02: at 0.02, Inter. 6 (0.35) sits under C 1 (0.36),
        // violating "C sits below Inter" below. At 0.015, Inter. 1-6 run
        // 0.45 -> 0.375, all above C 1.
        step: 0.015,
        divisions: 6,
    },
    {
        competitionKey: 'amnd',
        tier: 7,
        label: 'C',
        base: 0.36,
        step: 0.02,
        divisions: 6,
    },
    {
        competitionKey: 'amnd',
        tier: 8,
        label: 'Junior',
        base: 0.38,
        step: 0.015,
        divisions: 9,
    },
    {
        competitionKey: 'amnd',
        tier: 9,
        label: 'Sub-Junior',
        base: 0.32,
        step: 0.015,
        divisions: 9,
    },
    {
        competitionKey: 'amnd',
        tier: 10,
        label: 'Primary',
        base: 0.26,
        step: 0.015,
        // Primary 7 (and its 2026 7A/7B split, which share division 7) exist in
        // the imported grades, so the band must reach them or those finishes
        // would score nothing.
        divisions: 7,
    },
    {
        competitionKey: 'amnd',
        tier: 11,
        label: 'Sub-Primary',
        base: 0.2,
        step: 0.015,
        divisions: 2,
    },
];

export type GradeWeightSeed = {
    competitionKey: string;
    tier: number;
    division: number | null;
    label: string;
    weight: number;
};

// Float arithmetic otherwise yields 0.44999999999999996 for B.6.
function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}

function expandBand(band: Band): GradeWeightSeed[] {
    if (band.divisions === undefined) {
        return [
            {
                competitionKey: band.competitionKey,
                tier: band.tier,
                division: null,
                label: band.label,
                weight: round(band.base),
            },
        ];
    }

    const step = band.step ?? 0;
    return Array.from({ length: band.divisions }, (_, i) => i + 1)
        .filter((division) => band.skip?.includes(division) !== true)
        .map((division) => ({
            competitionKey: band.competitionKey,
            tier: band.tier,
            division,
            label: `${band.label} ${division}`,
            weight: round(band.base - (division - 1) * step),
        }));
}

export function buildGradeWeights(): GradeWeightSeed[] {
    return BANDS.flatMap(expandBand);
}
