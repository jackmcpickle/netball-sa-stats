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
            <span className="flex items-center gap-3">
                <span className="text-[13px] text-ink-muted">{label}</span>
                <Select.Trigger
                    aria-label={label}
                    className={`flex h-11 items-center justify-between gap-3 rounded-field border border-rule bg-paper px-4 text-base text-ink transition-colors hover:border-ink-faint data-[popup-open]:border-ink-faint ${
                        wide ? 'min-w-[20rem]' : 'min-w-[8rem]'
                    }`}
                >
                    <Select.Value />
                    <Select.Icon>
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
                    <Select.Popup className="max-h-80 min-w-[var(--anchor-width)] overflow-y-auto rounded-card border border-rule bg-paper py-1 shadow-lg shadow-black/5">
                        {options.map((option) => (
                            <Select.Item
                                key={String(option.value)}
                                value={option.value}
                                disabled={option.disabled}
                                className="grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2 text-sm text-ink data-[disabled]:text-ink-faint data-[highlighted]:bg-paper-sunken"
                            >
                                <Select.ItemIndicator>
                                    <CheckIcon />
                                </Select.ItemIndicator>
                                <span>
                                    <Select.ItemText>
                                        {option.label}
                                    </Select.ItemText>
                                    {option.hint ? (
                                        <span className="block text-xs text-ink-muted">
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
