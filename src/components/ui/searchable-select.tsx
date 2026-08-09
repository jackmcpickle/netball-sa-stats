import { Combobox } from '@base-ui/react/combobox';
import { useCallback, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { filterOptions, matchesQuery } from '@/components/ui/option-filter';
import type { SelectOption } from '@/components/ui/select';

interface SearchableSelectProps<Value extends string | number> {
    /** Visible label. Sits beside the trigger, never a placeholder. */
    readonly label: string;
    readonly value: Value;
    readonly options: readonly SelectOption<Value>[];
    readonly onValueChange: (value: Value) => void;
    /** Placeholder for the search input, e.g. "e.g. Premier Division". */
    readonly searchPlaceholder?: string;
    /** Noun used in the empty state and the live count, e.g. "grades". */
    readonly noun?: string;
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
 * Base UI's own filter signature: it hands us the item and the raw query.
 * Matching rules live in option-filter.ts so they can be unit tested.
 */
function filterOption(
    option: SelectOption<string | number>,
    query: string,
): boolean {
    return matchesQuery(option, query);
}

/**
 * A type-to-filter select, for lists too long to scan (grades, clubs).
 * Built on Base UI's Combobox with the input rendered inside the popup, so the
 * trigger keeps the same 44px field shape as `FieldSelect` while the popup
 * behaves as a proper combobox for keyboard and screen-reader users.
 */
export function SearchableSelect<Value extends string | number>({
    label,
    value,
    options,
    onValueChange,
    searchPlaceholder,
    noun = 'options',
}: SearchableSelectProps<Value>): ReactNode {
    // Mirrors the query Base UI holds internally, purely so the live region can
    // announce how many options survived the filter.
    const [query, setQuery] = useState('');

    const matchCount = useMemo(
        () => (query === '' ? 0 : filterOptions(options, query).length),
        [options, query],
    );

    const selected = useMemo(
        () => options.find((option) => option.value === value) ?? null,
        [options, value],
    );

    const handleChange = useCallback(
        (next: SelectOption<Value> | null): void => {
            // Base UI allows clearing to null; this select is always populated,
            // so a null is treated as "no change" rather than pushed at the caller.
            if (next !== null) {
                onValueChange(next.value);
            }
        },
        [onValueChange],
    );

    const renderItem = useCallback(
        (option: SelectOption<Value>): JSX.Element => (
            <Combobox.Item
                key={String(option.value)}
                value={option}
                disabled={option.disabled}
                className="grid cursor-default grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-sm text-ink select-none data-disabled:text-ink-faint data-highlighted:bg-paper-sunken"
            >
                <Combobox.ItemIndicator className="col-start-1 mt-1">
                    <CheckIcon />
                </Combobox.ItemIndicator>
                <span className="col-start-2 min-w-0">
                    <span className="block wrap-break-word">
                        {option.label}
                    </span>
                    {option.hint ? (
                        <span className="block text-xs wrap-break-word text-ink-muted">
                            {option.hint}
                        </span>
                    ) : null}
                </span>
            </Combobox.Item>
        ),
        [],
    );

    return (
        <Combobox.Root
            items={options}
            value={selected}
            onValueChange={handleChange}
            filter={filterOption}
            onInputValueChange={setQuery}
        >
            <span className="flex max-w-full min-w-0 items-center gap-3">
                <Combobox.Label className="shrink-0 text-[13px] text-ink-muted">
                    {label}
                </Combobox.Label>
                <Combobox.Trigger className="flex h-11 max-w-full min-w-0 flex-1 cursor-default items-center justify-between gap-3 rounded-field border border-rule bg-paper px-4 text-left text-base text-ink transition-colors select-none hover:border-ink-faint data-popup-open:border-ink-faint sm:w-80 sm:flex-none">
                    <span className="truncate">
                        <Combobox.Value />
                    </span>
                    <Combobox.Icon className="shrink-0">
                        <ChevronIcon />
                    </Combobox.Icon>
                </Combobox.Trigger>
            </span>
            <Combobox.Portal>
                <Combobox.Positioner
                    align="start"
                    sideOffset={6}
                    className="z-30"
                >
                    {/*
                     * Width is driven by the viewport, not just the anchor: the
                     * popup takes the wider of the trigger and 20rem, but never
                     * more than the space actually available. Without the
                     * `--available-width` clamp a narrow viewport collapses the
                     * popup and every option wraps into an unreadable stack.
                     */}
                    <Combobox.Popup
                        aria-label={label}
                        className="flex max-h-[min(24rem,var(--available-height))] w-[max(var(--anchor-width),min(20rem,var(--available-width)))] max-w-[var(--available-width)] flex-col overflow-hidden rounded-card border border-rule bg-paper shadow-lg shadow-black/5"
                    >
                        <Combobox.Input
                            placeholder={searchPlaceholder}
                            aria-label={`Search ${noun}`}
                            className="h-11 w-full shrink-0 border-b border-rule bg-paper px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                        <Combobox.Status className="sr-only">
                            {matchCount > 0
                                ? `${String(matchCount)} of ${String(options.length)} ${noun} match.`
                                : null}
                        </Combobox.Status>
                        <Combobox.Empty>
                            <span className="block px-4 py-5 text-sm text-ink-muted">
                                {`No ${noun} match that search.`}
                            </span>
                        </Combobox.Empty>
                        <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 empty:py-0">
                            {renderItem}
                        </Combobox.List>
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
}
