import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, setResponseHeader } from '@tanstack/react-start/server';
import type { JSX } from 'react';
import { z } from 'zod';
import { getDb } from '@/db';
import { startPlayHqImport } from '@/pipeline/import/start-import';
import { pageHead } from '@/seo/head';
import {
    ADMIN_COOKIE,
    clearSessionCookieHeader,
    passwordsMatch,
    SESSION_TTL_SECONDS,
    sessionCookieHeader,
    signSession,
    verifySession,
} from '@/server/admin-auth';
import { readAdminSecrets } from '@/server/admin-env';
import { createServices } from '@/server/container';

export const ensureAdminSession = createServerFn({ method: 'GET' })
    .validator(z.object({ next: z.string().optional() }))
    .handler(async ({ data }) => {
        const { sessionSecret } = readAdminSecrets();
        const cookie = getCookie(ADMIN_COOKIE);
        const nowEpochSeconds = Math.floor(Date.now() / 1000);
        if (
            sessionSecret.length === 0 ||
            !(await verifySession(cookie, sessionSecret, nowEpochSeconds))
        ) {
            throw redirect({
                to: '/admin/login',
                search: { next: data.next ?? '/admin' },
            });
        }
    });

export const loadAdmin = createServerFn({ method: 'GET' }).handler(async () => {
    await ensureAdminSession({ data: { next: '/admin' } });
    return await createServices(getDb()).admin.getPage();
});

export const runImport = createServerFn({ method: 'POST' })
    .validator(z.object({ yearsText: z.string() }))
    .handler(async ({ data }) => {
        await ensureAdminSession({ data: { next: '/admin' } });
        return await createServices(getDb(), {
            startImport: startPlayHqImport,
        }).admin.runImport(data.yearsText);
    });

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
    setResponseHeader('Set-Cookie', clearSessionCookieHeader());
    throw redirect({ to: '/admin/login' });
});

export const loginAdmin = createServerFn({ method: 'POST' })
    .validator(
        z.object({
            password: z.string(),
            next: z.string().optional(),
        }),
    )
    .handler(async ({ data }) => {
        const { password, sessionSecret } = readAdminSecrets();
        const { next } = data;
        if (password.length === 0 || sessionSecret.length === 0) {
            throw redirect({
                to: '/admin/login',
                search: { error: '1', next },
            });
        }
        const matched = await passwordsMatch(
            data.password,
            password,
            sessionSecret,
        );
        if (!matched) {
            throw redirect({
                to: '/admin/login',
                search: { error: '1', next },
            });
        }
        const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
        const value = await signSession(expiresAt, sessionSecret);
        setResponseHeader('Set-Cookie', sessionCookieHeader(value));
        if (next !== undefined && next.startsWith('/admin')) {
            throw redirect({ href: next });
        }
        throw redirect({ to: '/admin' });
    });

function AdminLayout(): JSX.Element {
    return <Outlet />;
}

export const Route = createFileRoute('/admin')({
    head: () =>
        pageHead({
            title: 'Admin',
            description: 'Import controls for the netball dataset.',
            path: '/admin',
            noIndex: true,
        }),
    beforeLoad: async ({ location }) => {
        if (location.pathname === '/admin/login') {
            return;
        }
        await ensureAdminSession({ data: { next: location.pathname } });
    },
    component: AdminLayout,
});
