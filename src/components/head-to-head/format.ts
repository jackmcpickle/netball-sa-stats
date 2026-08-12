import type { Meeting } from '@/server/dto/head-to-head.dto';

/** Signed, because an unsigned goal differential reads as a total. */
export function formatDiff(diff: number): string {
    return diff > 0 ? `+${String(diff)}` : String(diff);
}

/** `12–4–1`, in won–lost–drawn order. */
export function formatWld(record: {
    readonly won: number;
    readonly lost: number;
    readonly drawn: number;
}): string {
    return `${String(record.won)}–${String(record.lost)}–${String(record.drawn)}`;
}

/**
 * Why a scoreline on this row cannot be read as goals shot. Null for a plain
 * played game, which needs no caveat.
 */
export function meetingNote(meeting: Meeting): string | null {
    switch (meeting.status) {
        case 'forfeit':
            return 'Forfeit. PlayHQ records a nominal 0–20 scoreline, so these goals are excluded from totals.';
        case 'no_result':
            return 'No result recorded.';
        case 'scheduled':
            return 'Not yet played.';
        case 'bye':
        case 'final':
            return null;
        default:
            return null;
    }
}
