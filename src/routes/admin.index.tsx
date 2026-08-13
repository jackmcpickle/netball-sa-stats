import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/components/admin/admin-page';
import { loadAdmin } from '@/routes/admin';

export { loadAdmin, logout, runImport } from '@/routes/admin';

export const Route = createFileRoute('/admin/')({
    loader: async () => loadAdmin(),
    component: AdminPage,
});
