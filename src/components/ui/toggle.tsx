import { isUndefined } from 'es-toolkit';
import { useId, type JSX } from 'react';

export interface ToggleOption {
    readonly value: boolean;
    readonly label: string;
}

/**
 * Two mutually exclusive buttons rather than a checkbox: both states are named,
 * so "All clubs (incl. past)" never has to be inferred from an unchecked box.
 */
export function SegmentedToggle({
    label,
    value,
    options,
    hint,
    onValueChange,
}: {
    readonly label: string;
    readonly value: boolean;
    readonly options: readonly ToggleOption[];
    readonly hint?: string;
    readonly onValueChange: (next: boolean) => void;
}): JSX.Element {
    const labelId = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <span
                className="label-mono text-ink-muted"
                id={labelId}
            >
                {label}
            </span>
            <div
                role="group"
                aria-labelledby={labelId}
                className="inline-flex rounded-card border border-rule bg-paper p-0.5"
            >
                {options.map((option) => (
                    <button
                        key={String(option.value)}
                        type="button"
                        aria-pressed={option.value === value}
                        onClick={() => {
                            onValueChange(option.value);
                        }}
                        className={`rounded-card px-3 py-1.5 text-sm ${
                            option.value === value
                                ? 'bg-paper-sunken font-semibold text-ink'
                                : 'text-ink-muted'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {!isUndefined(hint) && (
                <span className="text-[13px] text-ink-muted">{hint}</span>
            )}
        </div>
    );
}
