import type { AccentName } from '@/server/dto/shared.dto';

/**
 * Accent name to static Tailwind classes.
 *
 * Written out in full rather than interpolated because Tailwind only ships
 * classes it can see in the source, and because it keeps every colour in the
 * `@theme` block rather than as a hex literal in a component.
 *
 * SVG paths take their colour from `currentColor`, so the text class is enough
 * for the charts too.
 */
const TEXT = {
    apricot: 'text-accent-apricot',
    coral: 'text-accent-coral',
    deep: 'text-accent-deep',
    forest: 'text-accent-forest',
    gold: 'text-accent-gold',
    lilac: 'text-accent-lilac',
    mint: 'text-accent-mint',
    ochre: 'text-accent-ochre',
    olive: 'text-accent-olive',
    pink: 'text-accent-pink',
    rust: 'text-accent-rust',
    slate: 'text-accent-slate',
    steel: 'text-accent-steel',
    violet: 'text-accent-violet',
} satisfies Record<AccentName, string>;

const BG = {
    apricot: 'bg-accent-apricot',
    coral: 'bg-accent-coral',
    deep: 'bg-accent-deep',
    forest: 'bg-accent-forest',
    gold: 'bg-accent-gold',
    lilac: 'bg-accent-lilac',
    mint: 'bg-accent-mint',
    ochre: 'bg-accent-ochre',
    olive: 'bg-accent-olive',
    pink: 'bg-accent-pink',
    rust: 'bg-accent-rust',
    slate: 'bg-accent-slate',
    steel: 'bg-accent-steel',
    violet: 'bg-accent-violet',
} satisfies Record<AccentName, string>;

/** Accents dark enough that a club card needs light text over them. */
const DARK: ReadonlySet<AccentName> = new Set<AccentName>([
    'deep',
    'violet',
    'forest',
    'rust',
    'slate',
    'steel',
    'ochre',
    'olive',
]);

export function accentText(accent: AccentName): string {
    return TEXT[accent];
}

export function accentBg(accent: AccentName): string {
    return BG[accent];
}

export function isDarkAccent(accent: AccentName): boolean {
    return DARK.has(accent);
}
