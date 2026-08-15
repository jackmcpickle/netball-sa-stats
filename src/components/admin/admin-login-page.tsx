import { getRouteApi } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback } from 'react';
import type { JSX } from 'react';
import { Eyebrow, PageShell, PageTitle } from '@/components/ui/layout';
import { loginAdmin } from '@/routes/admin';

const routeApi = getRouteApi('/admin/login');

const FIELD_CLASS =
    'mt-1.5 h-11 w-full rounded-field border border-rule bg-paper px-4 text-base text-ink';
const BUTTON_CLASS =
    'rounded-full border border-rule bg-paper-sunken px-5 py-2.5 text-sm font-semibold text-ink';

type FormSubmitEvent = {
    readonly currentTarget: HTMLFormElement;
    preventDefault(): void;
};

function formField(form: FormData, name: string): string {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
}

export function AdminLoginPage(): JSX.Element {
    const { error, next } = routeApi.useSearch();
    const loginFn = useServerFn(loginAdmin);

    const handleSubmit = useCallback(
        (event: FormSubmitEvent) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const submittedNext = formField(form, 'next');
            void loginFn({
                data: {
                    password: formField(form, 'password'),
                    next: submittedNext === '' ? undefined : submittedNext,
                },
            });
        },
        [loginFn],
    );

    return (
        <PageShell className="py-12 pb-24 sm:py-16">
            <Eyebrow>ADMIN</Eyebrow>
            <div className="mt-4 mb-10">
                <PageTitle>Sign in</PageTitle>
            </div>
            <form
                method="post"
                className="flex max-w-sm flex-col gap-5"
                onSubmit={handleSubmit}
            >
                {next !== undefined && next !== '' ? (
                    <input
                        type="hidden"
                        name="next"
                        value={next}
                    />
                ) : null}
                <label className="flex flex-col text-sm text-ink">
                    Password
                    <input
                        className={FIELD_CLASS}
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        required
                    />
                </label>
                {error === '1' ? (
                    <p className="text-sm text-fall">Wrong password.</p>
                ) : null}
                <button
                    type="submit"
                    className={BUTTON_CLASS}
                >
                    Sign in
                </button>
            </form>
        </PageShell>
    );
}
