/**
 * `accentFor` split out from `clubs.repo.ts` so that `db/queries/club-profile.ts`
 * (which needs it) and `clubs.repo.ts` (which needs `fetchClubProfile` from
 * `club-profile.ts`) don't import each other and form a cycle.
 */
import type { AccentName } from '@/server/dto/shared.dto';

const ACCENTS: readonly AccentName[] = [
    'pink',
    'deep',
    'lilac',
    'gold',
    'coral',
    'mint',
    'apricot',
    'violet',
    'forest',
    'rust',
    'slate',
    'ochre',
    'steel',
    'olive',
];

const MODULUS = 2_147_483_647;

/**
 * Stable string hash, modular rather than bitwise so it reads as arithmetic and
 * satisfies the no-bitwise rule.
 */
function hash(text: string): number {
    let h = 7;
    for (let i = 0; i < text.length; i += 1) {
        h = (h * 31 + text.charCodeAt(i)) % MODULUS;
    }
    return h;
}

/**
 * Accent from the club key rather than from its position in a list: a club must
 * keep its colour whether it is rendered from the club index, a ladder or a
 * profile, none of which share an ordering.
 */
export function accentFor(clubKey: string): AccentName {
    return ACCENTS[hash(clubKey) % ACCENTS.length];
}
