/**
 * The strength formula, and nothing else.
 *
 * The championship score is a sum over every team a club fields, so it rises
 * when a club adds weak teams and falls when it drops them. Strength is a
 * mean of size-independent finishes, so it answers a different question:
 * are this club's teams actually performing better, not just more numerous.
 */

export type StrengthRow = {
    /** 1 is best. */
    readonly ladderPosition: number;
    readonly teamCount: number;
};

/**
 * Finishing position as 0..1, where 1 won the grade. Size-independent, so a
 * club that fields fewer teams is not punished and one that pads its numbers
 * is not rewarded — the opposite of the championship score, deliberately.
 */
export function normalisedFinish(
    ladderPosition: number,
    teamCount: number,
): number | null {
    if (teamCount <= 1) {
        return null;
    }
    if (ladderPosition < 1 || ladderPosition > teamCount) {
        return null;
    }
    return (teamCount - ladderPosition) / (teamCount - 1);
}

/** Null when no row is measurable, so callers render a dash rather than 0. */
export function meanStrength(rows: readonly StrengthRow[]): number | null {
    let total = 0;
    let counted = 0;
    for (const row of rows) {
        const value = normalisedFinish(row.ladderPosition, row.teamCount);
        if (value === null) {
            continue;
        }
        total += value;
        counted += 1;
    }
    return counted === 0 ? null : total / counted;
}
