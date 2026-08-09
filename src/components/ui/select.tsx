import { Select } from '@base-ui/react/select';
import type { JSX, ReactNode } from 'react';

export interface SelectOption<Value extends string | number> {
    readonly value: Value;
    readonly label: string;
    /** Rendered under the label in the popup. Used for grade competitions. */
    readonly hint?: string;
    readonly disabled?: boolean;
}

interface FieldSelectProps<Value extends string | number> {
    /** Visible label. Sits beside the trigger, never a placeholder. */
    readonly label: string;
    readonly value: Value;
    readonly options: readonly SelectOption<Value>[];
    readonly onValueChange: (value: Value) => void;
    /** Widen the trigger where labels are long, e.g. grade names. */
    readonly wide?: boolean;
}

function CheckIcon(): JSX.Element {
    return (
        <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="size-3"
        >
            <path
                d="M1.5 6.5 4.5 9.5 10.5 2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ChevronIcon(): JSX.Element {
    return (
        <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="size-3 text-ink-muted"
        >
            <path
                d="M2.5 4.5 6 8 9.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Headless select styled to the mock's field: 44px tall, hairline border,
 * paper background, 12px radius. Base UI gives keyboard and screen-reader
 * behaviour without imposing any of its own visual language.
 */
export function FieldSelect<Value extends string | number>({
    label,
    value,
    options,
    onValueChange,
    wide = false,
}: FieldSelectProps<Value>): ReactNode {
    // Base UI allows clearing to null; this select is always populated, so a
    // null is treated as "no change" rather than pushed at the caller.
    const handleChange = (next: Value | null): void => {
        if (next !== null) {
            onValueChange(next);
        }
    };

    return (
        <Select.Root
            value={value}
            items={options}
            onValueChange={handleChange}
        >
            <span className="flex max-w-full min-w-0 items-center gap-3">
                <span className="shrink-0 text-[13px] text-ink-muted">
                    {label}
                </span>
                <Select.Trigger
                    aria-label={label}
                    className={`flex h-11 max-w-full min-w-0 flex-1 items-center justify-between gap-3 rounded-field border border-rule bg-paper px-4 text-left text-base text-ink transition-colors hover:border-ink-faint data-[popup-open]:border-ink-faint ${
                        wide ? 'sm:w-80 sm:flex-none' : 'sm:w-32 sm:flex-none'
                    }`}
                >
                    <span className="truncate">
                        <Select.Value />
                    </span>
                    <Select.Icon className="shrink-0">
                        <ChevronIcon />
                    </Select.Icon>
                </Select.Trigger>
            </span>
            <Select.Portal>
                <Select.Positioner
                    sideOffset={6}
                    alignItemWithTrigger={false}
                    className="z-30"
                >
                    {/*
                     * Width follows the anchor but is floored at a readable
                     * 16rem and ceilinged at the space actually available.
                     * Without the `--available-width` clamp a narrow viewport
                     * collapses the popup and options wrap into a stack.
                     */}
                    <Select.Popup className="max-h-[min(20rem,var(--available-height))] w-[max(var(--anchor-width),min(16rem,var(--available-width)))] max-w-[var(--available-width)] overflow-y-auto rounded-card border border-rule bg-paper py-1 shadow-lg shadow-black/5">
                        {options.map((option) => (
                            <Select.Item
                                key={String(option.value)}
                                value={option.value}
                                disabled={option.disabled}
                                className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-sm text-ink data-[disabled]:text-ink-faint data-[highlighted]:bg-paper-sunken"
                            >
                                <Select.ItemIndicator className="col-start-1 mt-1">
                                    <CheckIcon />
                                </Select.ItemIndicator>
                                <span className="col-start-2 min-w-0">
                                    <Select.ItemText className="block wrap-break-word">
                                        {option.label}
                                    </Select.ItemText>
                                    {option.hint ? (
                                        <span className="block text-xs wrap-break-word text-ink-muted">
                                            {option.hint}
                                        </span>
                                    ) : null}
                                </span>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}
