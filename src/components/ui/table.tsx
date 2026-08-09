import type { JSX, ReactNode } from 'react';

/**
 * Shared table furniture. Real `<table>` markup rather than the mock's grid of
 * divs: the mock's columns are a visual choice, but the content is tabular and
 * screen readers need the header association.
 */
export function TableFrame({
    children,
}: {
    readonly children: ReactNode;
}): JSX.Element {
    return (
        <div className="overflow-x-auto overscroll-x-contain rounded-card border border-rule bg-paper [-webkit-overflow-scrolling:touch]">
            {children}
        </div>
    );
}

export function Table({
    caption,
    children,
    /** `compact` for short tables (e.g. grade weights) that fit phone widths. */
    layout = 'wide',
}: {
    /** Visually hidden; the visible heading sits above the frame. */
    readonly caption: string;
    readonly children: ReactNode;
    readonly layout?: 'wide' | 'compact';
}): JSX.Element {
    return (
        <table
            className={`w-full border-collapse text-left ${
                layout === 'compact'
                    ? 'min-w-0'
                    : 'min-w-[36rem] sm:min-w-[44rem]'
            }`}
        >
            <caption className="sr-only">{caption}</caption>
            {children}
        </table>
    );
}

const ALIGN = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
} as const;

export type Align = keyof typeof ALIGN;

export function Th({
    children,
    align = 'left',
    scope = 'col',
}: {
    readonly children: ReactNode;
    readonly align?: Align;
    readonly scope?: 'col' | 'row';
}): JSX.Element {
    return (
        <th
            scope={scope}
            className={`label-mono bg-paper-sunken px-2.5 py-3 font-medium first:pl-4 last:pr-4 sm:px-3 sm:py-3.5 sm:first:pl-6 sm:last:pr-6 ${ALIGN[align]}`}
        >
            {children}
        </th>
    );
}

export function Td({
    children,
    align = 'left',
    emphasis = 'normal',
}: {
    readonly children: ReactNode;
    readonly align?: Align;
    /** `strong` for the figures the row is really about. */
    readonly emphasis?: 'normal' | 'strong' | 'quiet';
}): JSX.Element {
    const tone =
        emphasis === 'strong'
            ? 'font-semibold text-ink'
            : emphasis === 'quiet'
              ? 'text-ink-muted'
              : 'text-ink-body';
    return (
        <td
            className={`px-2.5 py-3 text-sm first:pl-4 last:pr-4 sm:px-3 sm:py-3.5 sm:first:pl-6 sm:last:pr-6 ${ALIGN[align]} ${tone}`}
        >
            {children}
        </td>
    );
}

/** Zebra striping in the mock's two warm paper tones, plus a hairline rule. */
export function Tr({
    children,
    index,
    highlight = false,
}: {
    readonly children: ReactNode;
    readonly index: number;
    readonly highlight?: boolean;
}): JSX.Element {
    return (
        <tr
            className={`border-t border-rule ${
                highlight
                    ? 'bg-paper-sunken'
                    : index % 2 === 1
                      ? 'bg-paper'
                      : 'bg-paper-alt'
            }`}
        >
            {children}
        </tr>
    );
}
