/**
 * The competition catalogue and the grade-weight defaults.
 *
 * Weights are generated from `base - (division - 1) * step` rather than 40 hand-typed
 * numbers, so a band can be retuned in one place. Rows stay individually editable in
 * D1 afterwards — scoring reads the table, not this file.
 */
import { isNull, isUndefined } from 'es-toolkit';

export interface CompetitionSeed {
    key: string;
    name: string;
    playhqOrgId: string | null;
    /** False for competitions seeded for shape only, with no data yet. */
    hasData: boolean;
}

export const COMPETITION_SEEDS: readonly CompetitionSeed[] = [
    {
        hasData: true,
        key: 'amnd',
        name: 'Adelaide Metropolitan Netball Division',
        playhqOrgId: '7a5f35e1',
    },
    {
        hasData: true,
        key: 'premier_league',
        name: 'Netball SA Premier League',
        playhqOrgId: '6fefc037',
    },
    {
        hasData: true,
        key: 'premier_league_reserves',
        name: 'Premier League Reserves',
        playhqOrgId: '6fefc037',
    },
    {
        hasData: false,
        key: 'city_night_division',
        name: 'City Night Division',
        playhqOrgId: '2276ec85',
    },
    {
        hasData: false,
        key: 'super_league',
        name: 'Super League',
        playhqOrgId: null,
    },
    { hasData: false, key: 'juniors', name: 'Juniors', playhqOrgId: null },
    {
        hasData: false,
        key: 'saucna',
        name: 'South Australian United Church Netball Association',
        playhqOrgId: 'fb89f1f1',
    },
    {
        hasData: false,
        key: 'suna',
        name: 'Southern United Netball Association',
        playhqOrgId: '4bd9b8ae',
    },
    {
        hasData: false,
        key: 'elizabeth',
        name: 'Elizabeth Netball Association',
        playhqOrgId: '7ffb0e67',
    },
    {
        hasData: false,
        key: 'sammna',
        name: "South Australian Men's and Mixed Netball Association",
        playhqOrgId: '7936878d',
    },
    {
        hasData: false,
        key: 'sadna',
        name: 'SA Districts Netball Association',
        playhqOrgId: null,
    },
];

const CHAMPIONSHIP_SEED_KEYS: ReadonlySet<string> = new Set([
    'amnd',
    'premier_league',
    'premier_league_reserves',
]);

function associationCompetitionKeys(): ReadonlySet<string> {
    const keys: string[] = [];
    for (const competition of COMPETITION_SEEDS) {
        if (
            !isNull(competition.playhqOrgId) &&
            !CHAMPIONSHIP_SEED_KEYS.has(competition.key)
        ) {
            keys.push(competition.key);
        }
    }
    return new Set(keys);
}

/** Associations fetched via their own PlayHQ org. No championship bands. */
export const ASSOCIATION_COMPETITION_KEYS: ReadonlySet<string> =
    associationCompetitionKeys();

export function catalogueByKey(key: string): CompetitionSeed | undefined {
    return COMPETITION_SEEDS.find((competition) => competition.key === key);
}

interface Band {
    competitionKey: string;
    tier: number;
    label: string;
    base: number;
    /** Per-division decrement. Omitted for single-grade bands. */
    step?: number;
    divisions?: number;
    /** Divisions that never existed, e.g. AMND ran C.1–C.4 and C.6 but no C.5. */
    skip?: readonly number[];
}

/**
 * Ordering notes for the two contentious calls:
 * - Reserves (0.80) sits above AMND League (0.75): a Premier club's second string
 *   outranks the best metro club.
 * - C sits below Inter. The archived AMND regrading PDFs show two-way promotion and
 *   relegation between B.5 and C.1, so C is a normal competitive band, just lower.
 */
export const BANDS: readonly Band[] = [
    {
        base: 1,
        competitionKey: 'premier_league',
        label: 'Premier Division',
        tier: 1,
    },
    {
        base: 0.8,
        competitionKey: 'premier_league_reserves',
        label: 'Reserves Division',
        tier: 2,
    },
    { base: 0.75, competitionKey: 'amnd', label: 'AMND League', tier: 3 },
    { base: 0.68, competitionKey: 'amnd', label: 'A. Grade', tier: 4 },
    {
        base: 0.62,
        competitionKey: 'amnd',
        divisions: 6,
        label: 'B',
        step: 0.03,
        tier: 5,
    },
    {
        base: 0.45,
        competitionKey: 'amnd',
        divisions: 6,
        label: 'Inter.',
        // 0.015, not 0.02: at 0.02, Inter. 6 (0.35) sits under C 1 (0.36),
        // violating "C sits below Inter" below. At 0.015, Inter. 1-6 run
        // 0.45 -> 0.375, all above C 1.
        step: 0.015,
        tier: 6,
    },
    {
        base: 0.36,
        competitionKey: 'amnd',
        divisions: 6,
        label: 'C',
        step: 0.02,
        tier: 7,
    },
    {
        base: 0.38,
        competitionKey: 'amnd',
        divisions: 9,
        label: 'Junior',
        step: 0.015,
        tier: 8,
    },
    {
        base: 0.32,
        competitionKey: 'amnd',
        divisions: 9,
        label: 'Sub-Junior',
        step: 0.015,
        tier: 9,
    },
    {
        base: 0.26,
        competitionKey: 'amnd',
        // Primary 7 (and its 2026 7A/7B split, which share division 7) exist in
        // the imported grades, so the band must reach them or those finishes
        // would score nothing.
        divisions: 7,
        label: 'Primary',
        step: 0.015,
        tier: 10,
    },
    {
        base: 0.2,
        competitionKey: 'amnd',
        divisions: 2,
        label: 'Sub-Primary',
        step: 0.015,
        tier: 11,
    },
];

export interface GradeWeightSeed {
    competitionKey: string;
    tier: number;
    division: number | null;
    label: string;
    weight: number;
}

// Float arithmetic otherwise yields 0.44999999999999996 for B.6.
function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}

function expandBand(band: Band): GradeWeightSeed[] {
    if (isUndefined(band.divisions)) {
        return [
            {
                competitionKey: band.competitionKey,
                division: null,
                label: band.label,
                tier: band.tier,
                weight: round(band.base),
            },
        ];
    }

    const step = band.step ?? 0;
    return Array.from({ length: band.divisions }, (_, i) => i + 1)
        .filter((division) => band.skip?.includes(division) !== true)
        .map((division) => ({
            competitionKey: band.competitionKey,
            division,
            label: `${band.label} ${division}`,
            tier: band.tier,
            weight: round(band.base - (division - 1) * step),
        }));
}

export function buildGradeWeights(): GradeWeightSeed[] {
    return BANDS.flatMap(expandBand);
}

/** Catalogue keys whose finishes currently count in the club championship. */
export function championshipCompetitionKeys(): ReadonlySet<string> {
    return new Set(BANDS.map((band) => band.competitionKey));
}
