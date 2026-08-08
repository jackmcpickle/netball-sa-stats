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
        <div className={`mx-auto max-w-shell px-5 sm:px-8 ${className}`}>
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

/**
 * The honest empty state for a feature the data cannot support yet. Never
 * dressed up with placeholder figures — a fake number is worse than no page.
 */
export function NotAvailable({
    title,
    reason,
    children,
}: {
    readonly title: string;
    readonly reason: string;
    readonly children?: ReactNode;
}): JSX.Element {
    return (
        <Panel
            tone="raised"
            className="p-8 sm:p-12"
        >
            <p className="label-mono">{'NOT AVAILABLE YET'}</p>
            <h2 className="mt-4 text-2xl font-medium tracking-tight text-ink sm:text-panel">
                {title}
            </h2>
            <p className="mt-4 max-w-[56ch] leading-relaxed text-ink-body">
                {reason}
            </p>
            {children}
        </Panel>
    );
}
