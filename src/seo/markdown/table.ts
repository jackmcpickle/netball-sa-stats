/** Minimal GitHub-flavoured markdown helpers for the agent-facing pages. */
import { isNil } from 'es-toolkit';

/** Escapes the only character that can break a markdown table cell. */
function cell(value: string): string {
    return value.replaceAll('|', '\\|');
}

export function formatCell(value: string | number | null | undefined): string {
    if (isNil(value)) {
        return '—';
    }
    return cell(String(value));
}

export function table(
    headers: readonly string[],
    rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
    if (rows.length === 0) {
        return '_No rows._';
    }
    const head = `| ${headers.map(cell).join(' | ')} |`;
    const rule = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${row.map(formatCell).join(' | ')} |`);
    return [head, rule, ...body].join('\n');
}

/** YAML front matter, so an agent gets identity before it reads prose. */
export function frontMatter(fields: Record<string, string>): string {
    const lines = Object.entries(fields).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    );
    return ['---', ...lines, '---'].join('\n');
}

export function section(heading: string, ...body: string[]): string {
    return [heading, '', ...body].join('\n');
}
