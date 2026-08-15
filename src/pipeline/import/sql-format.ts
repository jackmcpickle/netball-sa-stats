import { isNull } from 'es-toolkit';
/** Inline SQL literal formatting. `wrangler d1 execute --file` has no bind-parameter support. */

export function sqlText(value: string | null): string {
    return isNull(value) ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
}

export function sqlNumber(value: number | null): string {
    return isNull(value) ? 'NULL' : String(value);
}

export function sqlBool(value: boolean): string {
    return value ? '1' : '0';
}
