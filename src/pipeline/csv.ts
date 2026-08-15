/**
 * Shared CSV helpers. Lifted out of `scripts/generate-seed.ts` so the fetch
 * pipeline (and anything else) can reuse the exact same escaping rules
 * instead of drifting.
 */

export type CsvValue = string | number | null;

export function cell(value: CsvValue): string {
    if (value === null) {
        return '';
    }
    const text = String(value);
    return /["\n,]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly Record<string, CsvValue>[]): string {
    const [first] = rows;
    if (first === undefined) {
        return '';
    }
    const headers = Object.keys(first);
    const lines = rows.map((row) =>
        headers.map((header) => cell(row[header] ?? null)).join(','),
    );
    return `${[headers.join(','), ...lines].join('\n')}\n`;
}

interface ScanState {
    rows: string[][];
    row: string[];
    field: string;
    inQuotes: boolean;
}

/** Consumes one character inside a quoted field; returns characters used. */
function stepQuoted(state: ScanState, char: string, next?: string): number {
    if (char === '"') {
        if (next === '"') {
            state.field += '"';
            return 2;
        }
        state.inQuotes = false;
        return 1;
    }
    state.field += char;
    return 1;
}

/** Consumes one character outside a quoted field; returns characters used. */
function stepUnquoted(state: ScanState, char: string, next?: string): number {
    if (char === '"') {
        state.inQuotes = true;
        return 1;
    }
    if (char === ',') {
        state.row.push(state.field);
        state.field = '';
        return 1;
    }
    if (char === '\n' || char === '\r') {
        state.row.push(state.field);
        state.rows.push(state.row);
        state.row = [];
        state.field = '';
        // Treat CRLF as a single terminator.
        return char === '\r' && next === '\n' ? 2 : 1;
    }
    state.field += char;
    return 1;
}

/** Minimal RFC4180 parser (quoted fields, embedded commas/newlines/quotes). */
export function parseCsv(text: string): Record<string, string>[] {
    const trimmed = text.trim();
    if (trimmed === '') {
        return [];
    }

    const state: ScanState = {
        rows: [],
        row: [],
        field: '',
        inQuotes: false,
    };
    let i = 0;
    while (i < trimmed.length) {
        const char = trimmed[i] ?? '';
        const next = trimmed[i + 1];
        i += state.inQuotes
            ? stepQuoted(state, char, next)
            : stepUnquoted(state, char, next);
    }
    state.row.push(state.field);
    state.rows.push(state.row);

    const [header, ...body] = state.rows;
    if (header === undefined) {
        return [];
    }
    return body.map((cells) =>
        Object.fromEntries(
            header.map((key, index) => [key, cells[index] ?? '']),
        ),
    );
}
