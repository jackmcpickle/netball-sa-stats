import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminLoginPage } from '@/components/admin/admin-login-page';

export { loginAdmin } from '@/routes/admin';

const loginSearchSchema = z.object({
    next: z.string().optional(),
    error: z.string().optional(),
});

export const Route = createFileRoute('/admin/login')({
    validateSearch: loginSearchSchema,
    // oxlint-disable-next-line eslint/no-empty-function -- required no-op loader: the login route has nothing to fetch, but declaring it keeps the route's loader type defined
    loader: () => {},
    component: AdminLoginPage,
});
