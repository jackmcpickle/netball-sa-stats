import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates SQL; wrangler applies it via the D1 binding
// (`vp run db:migrate:local` / `db:migrate:remote`), so no API token is needed.
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema.ts',
    out: './drizzle',
    casing: 'snake_case',
});
