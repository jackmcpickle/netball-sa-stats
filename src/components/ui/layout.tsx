import type { JSX, ReactNode } from 'react';

/** The 1280px editorial measure the whole mock is built on. */
export function PageShell({
    children,
    className = '',
}: {
    readonly children: ReactNode;
    readonly className?: string;
}): JSX.Element {
    return (
        <div className={`mx-auto max-w-shell px-4 sm:px-8 ${className}`}>
            {children}
        </div>
    );
}

/** Mono, letterspaced, uppercase. The mock's standing kicker. */
export function Eyebrow({
    children,
}: {
    readonly children: ReactNode;
}): JSX.Element {
    return <p className="label-mono">{children}</p>;
}

export function PageTitle({
    children,
}: {
    readonly children: ReactNode;
}): JSX.Element {
    return (
        <h1 className="text-3xl font-medium tracking-tight text-pretty text-ink sm:text-title">
            {children}
        </h1>
    );
}

/** Bordered card on paper. `tone="raised"` matches the mock's warm panels. */
export function Panel({
    children,
    tone = 'plain',
    className = '',
}: {
    readonly children: ReactNode;
    readonly tone?: 'plain' | 'raised';
    readonly className?: string;
}): JSX.Element {
    return (
        <section
            className={`rounded-panel border border-rule ${
                tone === 'raised' ? 'bg-paper-raised' : 'bg-paper'
            } ${className}`}
        >
            {children}
        </section>
    );
}

/** A big number over a quiet caption. Used across the hero and club profile. */
export function StatFigure({
    value,
    caption,
    size = 'md',
}: {
    readonly value: ReactNode;
    readonly caption: string;
    readonly size?: 'sm' | 'md' | 'lg';
}): JSX.Element {
    const valueClass =
        size === 'lg'
            ? 'text-5xl sm:text-[3.5rem] tracking-[-0.125rem]'
            : size === 'md'
              ? 'text-[2.5rem] tracking-[-0.0625rem]'
              : 'text-3xl tracking-[-0.03125rem]';
    return (
        <div>
            <div className={`leading-none font-medium text-ink ${valueClass}`}>
                {value}
            </div>
            <div className="mt-1.5 text-[13px] text-ink-muted">{caption}</div>
        </div>
    );
}
