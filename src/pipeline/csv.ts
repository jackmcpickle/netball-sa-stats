/**
 * Shared CSV helpers. Lifted out of `scripts/generate-seed.ts` so the fetch
 * pipeline (and anything else) can reuse the exact same escaping rules
 * instead of drifting.
 */

export type CsvValue = string | number | null;

export function cell(value: CsvValue): string {
    if (value === null) return '';
    const text = String(value);
    return /["\n,]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly Record<string, CsvValue>[]): string {
    const [first] = rows;
    if (first === undefined) return '';
    const headers = Object.keys(first);
    const lines = rows.map((row) =>
        headers.map((header) => cell(row[header] ?? null)).join(','),
    );
    return `${[headers.join(','), ...lines].join('\n')}\n`;
}

/** Minimal RFC4180 parser (quoted fields, embedded commas/newlines/quotes). */
export function parseCsv(text: string): Record<string, string>[] {
    const trimmed = text.trim();
    if (trimmed === '') return [];

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < trimmed.length) {
        const char = trimmed[i];
        if (inQuotes) {
            if (char === '"') {
                if (trimmed[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += char;
            i += 1;
            continue;
        }
        if (char === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (char === ',') {
            row.push(field);
            field = '';
            i += 1;
            continue;
        }
        if (char === '\n' || char === '\r') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            if (char === '\r' && trimmed[i + 1] === '\n') i += 1;
            i += 1;
            continue;
        }
        field += char;
        i += 1;
    }
    row.push(field);
    rows.push(row);

    const [header, ...body] = rows;
    if (header === undefined) return [];
    return body.map((cells) =>
        Object.fromEntries(
            header.map((key, index) => [key, cells[index] ?? '']),
        ),
    );
}
