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
    pink: 'text-accent-pink',
    deep: 'text-accent-deep',
    lilac: 'text-accent-lilac',
    gold: 'text-accent-gold',
    coral: 'text-accent-coral',
    mint: 'text-accent-mint',
    apricot: 'text-accent-apricot',
    violet: 'text-accent-violet',
    forest: 'text-accent-forest',
    rust: 'text-accent-rust',
    slate: 'text-accent-slate',
    ochre: 'text-accent-ochre',
    steel: 'text-accent-steel',
    olive: 'text-accent-olive',
} satisfies Record<AccentName, string>;

const BG = {
    pink: 'bg-accent-pink',
    deep: 'bg-accent-deep',
    lilac: 'bg-accent-lilac',
    gold: 'bg-accent-gold',
    coral: 'bg-accent-coral',
    mint: 'bg-accent-mint',
    apricot: 'bg-accent-apricot',
    violet: 'bg-accent-violet',
    forest: 'bg-accent-forest',
    rust: 'bg-accent-rust',
    slate: 'bg-accent-slate',
    ochre: 'bg-accent-ochre',
    steel: 'bg-accent-steel',
    olive: 'bg-accent-olive',
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
