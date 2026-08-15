import { getRouteApi, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { NO_VALUE } from '@/components/format';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { Table, TableFrame, Td, Th, Tr } from '@/components/ui/table';
import { logout, runImport } from '@/routes/admin';
import type { AdminPageDto, AdminRunDto } from '@/server/dto/admin.dto';
import type { RunImportError } from '@/server/services/admin.service';

const routeApi = getRouteApi('/admin/');

const BUTTON_CLASS =
    'rounded-full border border-rule bg-paper-sunken px-5 py-2.5 text-sm font-semibold text-ink disabled:text-ink-faint';
const FIELD_CLASS =
    'mt-1.5 h-11 w-full max-w-sm rounded-field border border-rule bg-paper px-4 text-base text-ink';

interface FormSubmitEvent {
    readonly currentTarget: HTMLFormElement;
    readonly preventDefault: () => void;
}

interface RunButtonEvent {
    readonly currentTarget: HTMLButtonElement;
}

/**
 * `FormData.get` returns `File | string | null`; only a text field is ever
 * meaningful here, so a file or a missing field reads as the empty string.
 */
function formField(form: FormData, name: string): string {
    const value = form.get(name);
    return value instanceof File || value === null ? '' : value;
}

function statusStrip(page: AdminPageDto): string {
    if (page.running && page.runningElapsedLabel !== null) {
        return `Import in progress · ${page.runningElapsedLabel}`;
    }
    const [latest] = page.runs;
    if (page.lastStatus !== null && latest !== undefined) {
        return `Last run: ${latest.startedLabel} · ${page.lastStatus}`;
    }
    return 'No import runs yet';
}

function runErrorMessage(kind: RunImportError['kind']): string {
    if (kind === 'already-running') {
        return 'An import is already running.';
    }
    return 'Years must be four-digit start years, separated by commas.';
}

function cellValue(value: number | null): string {
    return value === null ? NO_VALUE : String(value);
}

function renderSelectedDetail(
    run: AdminRunDto | undefined,
): JSX.Element | null {
    if (run === undefined) {
        return null;
    }
    return (
        <section
            className="mt-6 max-w-[62ch]"
            aria-live="polite"
        >
            <h2 className="mb-3 text-lg font-semibold text-ink">Run detail</h2>
            {run.errorText === null ? null : (
                <p className="text-sm text-fall">{run.errorText}</p>
            )}
            {run.warnings.length > 0 ? (
                <ul className="mt-3 list-disc pl-5 text-sm text-ink-body">
                    {run.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            ) : null}
            {run.errorText === null && run.warnings.length === 0 ? (
                <p className="text-sm text-ink-muted">
                    No errors or warnings for this run.
                </p>
            ) : null}
        </section>
    );
}

function renderRunsTable(
    runs: readonly AdminRunDto[],
    selectedId: number | null,
    onSelectRun: (event: RunButtonEvent) => void,
): JSX.Element {
    return (
        <TableFrame>
            <Table
                layout="wide"
                caption="PlayHQ import runs"
            >
                <thead>
                    <tr>
                        <Th>STARTED</Th>
                        <Th>STATUS</Th>
                        <Th align="right">SEASONS</Th>
                        <Th align="right">GRADES</Th>
                        <Th align="right">GAMES</Th>
                        <Th align="right">WARNINGS</Th>
                        <Th align="right">DURATION</Th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run, index) => (
                        <Tr
                            key={run.id}
                            index={index}
                            highlight={run.id === selectedId}
                        >
                            <Td emphasis="strong">
                                <button
                                    type="button"
                                    className="text-left font-semibold text-ink"
                                    data-run-id={String(run.id)}
                                    onClick={onSelectRun}
                                >
                                    {run.startedLabel}
                                </button>
                            </Td>
                            <Td>{run.status}</Td>
                            <Td align="right">{cellValue(run.seasons)}</Td>
                            <Td align="right">{cellValue(run.grades)}</Td>
                            <Td align="right">{cellValue(run.gamesCount)}</Td>
                            <Td align="right">{String(run.warningCount)}</Td>
                            <Td align="right">{run.durationLabel}</Td>
                        </Tr>
                    ))}
                </tbody>
            </Table>
        </TableFrame>
    );
}

export function AdminPage(): JSX.Element {
    const page = routeApi.useLoaderData();
    const router = useRouter();
    const runImportFn = useServerFn(runImport);
    const logoutFn = useServerFn(logout);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const selected = page.runs.find((run) => run.id === selectedId);

    const onSelectRun = useCallback((event: RunButtonEvent) => {
        const raw = event.currentTarget.dataset.runId;
        if (raw === undefined) {
            return;
        }
        setSelectedId(Number(raw));
    }, []);

    const handleRun = useCallback(
        (event: FormSubmitEvent) => {
            event.preventDefault();
            const yearsText = formField(
                new FormData(event.currentTarget),
                'years',
            );
            void (async (): Promise<void> => {
                const result = await runImportFn({ data: { yearsText } });
                if (!result.ok) {
                    setRunError(runErrorMessage(result.error.kind));
                    return;
                }
                setRunError(null);
                await router.invalidate();
            })();
        },
        [runImportFn, router],
    );

    const handleLogout = useCallback(
        (event: FormSubmitEvent) => {
            event.preventDefault();
            void logoutFn();
        },
        [logoutFn],
    );

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>ADMIN</Eyebrow>
            <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
                <PageTitle>Import</PageTitle>
                <form
                    method="post"
                    onSubmit={handleLogout}
                >
                    <button
                        type="submit"
                        className={BUTTON_CLASS}
                    >
                        Sign out
                    </button>
                </form>
            </div>

            <p className="mb-8 text-sm text-ink-body">{statusStrip(page)}</p>

            <form
                method="post"
                className="mb-10 flex flex-col gap-4"
                onSubmit={handleRun}
            >
                <div>
                    <button
                        type="submit"
                        className={BUTTON_CLASS}
                        disabled={page.running}
                    >
                        Run import
                    </button>
                </div>
                <details className="max-w-sm">
                    <summary className="cursor-pointer text-sm text-ink-muted">
                        Years
                    </summary>
                    <label className="mt-3 flex flex-col text-sm text-ink">
                        Comma-separated start years
                        <input
                            className={FIELD_CLASS}
                            type="text"
                            name="years"
                            inputMode="numeric"
                            autoComplete="off"
                            disabled={page.running}
                        />
                    </label>
                </details>
                {runError === null ? null : (
                    <p className="text-sm text-fall">{runError}</p>
                )}
            </form>

            {renderRunsTable(page.runs, selectedId, onSelectRun)}
            {renderSelectedDetail(selected)}
        </PageShell>
    );
}
