import { resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import ultraciteAntiSlop from 'ultracite/oxlint/anti-slop';
import ultraciteCore from 'ultracite/oxlint/core';
import ultraciteJsPlugins from 'ultracite/oxlint/js-plugins';
import ultraciteReact from 'ultracite/oxlint/react';
import ultraciteTanstack from 'ultracite/oxlint/tanstack';
import ultraciteTanstackJsPlugins from 'ultracite/oxlint/tanstack/js-plugins';
import ultraciteVitest from 'ultracite/oxlint/vitest';
import { defineConfig } from 'vite-plus';

// The Cloudflare plugin rejects the `resolve.external` Vitest sets on the ssr
// environment, so it is left out of test runs. Pipeline and scoring logic is plain
// TypeScript and needs no workerd runtime to test.
const isTest = process.env.VITEST === 'true';

export default defineConfig({
    plugins: [
        ...(isTest ? [] : [cloudflare({ viteEnvironment: { name: 'ssr' } })]),
        tailwindcss(),
        tanstackStart(),
        react(),
    ],
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname, 'src'),
        },
    },
    staged: {
        '*': 'vp check --fix',
    },
    fmt: {
        semi: true,
        singleQuote: true,
        printWidth: 80,
        jsxSingleQuote: false,
        bracketSameLine: false,
        arrowParens: 'always',
        proseWrap: 'preserve',
        singleAttributePerLine: true,
        htmlWhitespaceSensitivity: 'css',
        useTabs: false,
        endOfLine: 'lf',
        trailingComma: 'all',
        tabWidth: 4,
        insertFinalNewline: true,
        sortTailwindcss: {
            stylesheet: './src/style.css',
            functions: ['cn', 'clsx', 'cva', 'cx'],
            attributes: ['class', 'classList', 'className'],
        },
        sortImports: {
            groups: [
                ['builtin'],
                ['external', 'type-external'],
                ['internal', 'type-internal'],
                ['parent', 'type-parent'],
                ['sibling', 'type-sibling'],
                ['index', 'type-index'],
            ],
            newlinesBetween: false,
        },
        overrides: [
            {
                files: ['*.yml', '*.yaml'],
                options: {
                    tabWidth: 2,
                    singleQuote: false,
                },
            },
        ],
        sortPackageJson: true,
        bracketSpacing: true,
        quoteProps: 'as-needed',
        ignorePatterns: [
            'src/routeTree.gen.ts',
            '.wrangler/',
            '.output/',
            '.tanstack/',
            'drizzle/',
            'docs/design/',
            'data/archive/fixtures/',
            'data/archive/placements/',
            'worker-configuration.d.ts',
            'e2e/',
            'playwright-report/',
            'test-results/',
        ],
    },
    lint: {
        // Ultracite presets (https://www.ultracite.ai/docs/provider/oxlint) are
        // extended as config objects — Vite+ owns the oxlint config, so there is
        // no oxlint.config.ts / .oxlintrc.json. Repo rules below win: extends are
        // merged first-to-last, then this block's own keys.
        extends: [
            ultraciteCore,
            ultraciteReact,
            ultraciteTanstack,
            ultraciteVitest,
            // Must follow core: it turns off two core rules it conflicts with.
            ultraciteAntiSlop,
            ultraciteJsPlugins,
            ultraciteTanstackJsPlugins,
        ],
        options: { typeAware: true, typeCheck: true, denyWarnings: true },
        rules: {
            // --- Ultracite preset rules that clash with settled repo choices ---
            // `func-style: declaration` below is the repo's stance; this rule
            // demands the opposite for components.
            'react/function-component-definition': 'off',
            // TanStack file-based routing owns these names (`$clubKey`, `[.]`,
            // dot-segmented `*.service.ts`); the regex can't accommodate them.
            'github/filenames-match-regex': 'off',
            // Same reasoning as `max-lines-per-function` being off for tests:
            // table-driven assertions are the point.
            'vitest/max-expects': 'off',
            // React Compiler is not enabled (no babel-plugin-react-compiler), so
            // useMemo/useCallback are still doing real work.
            'react-doctor/react-compiler-no-manual-memoization': 'off',
            // The repo imports named bindings from node builtins everywhere.
            'unicorn/import-style': 'off',
            // Key order is load-bearing here: TanStack's `navigate`/route option
            // objects infer from the order they are written, and object literals
            // containing `await` change evaluation order when sorted.
            'sort-keys': 'off',
            'typescript/consistent-type-definitions': 'error',
            // Measured: 17 findings, 12 files, and every one needs suppressing,
            // so per-file scoping would buy nothing. Eight are explicit
            // `undefined` arguments to *required* parameters (`ok(undefined)`,
            // `seasonWanted(s, undefined)`, `formatNumber(undefined)`) — the
            // autofix drops them and `tsc` fails with TS2554. Five are
            // `return undefined;`, where the autofix's `return;` violates
            // `consistent-return`, which this same preset enables. The last is
            // not autofixable. es-toolkit's `isNil`/`isUndefined` do not help:
            // they replace checks, and none of these are checks.
            'sonarjs/no-undefined-assignment': 'off',
            'unicorn/no-useless-undefined': 'off',
            // `ClubKey`/`GradeKey`/`CompetitionKey` are documented domain
            // aliases; collapsing them to `string` loses the intent.
            'sonarjs/redundant-type-aliases': 'off',
            // A three-member cap is wrong for enum-shaped domain unions
            // (`'up' | 'down' | 'level' | 'new'`) and DTO cell types.
            'sonarjs/max-union-size': 'off',
            // The dev-only scripts shell out to `wrangler` from PATH on purpose.
            'sonarjs/no-os-command-from-path': 'off',
            // Its autofix rewrites `toHaveBeenCalled()` as
            // `toHaveBeenCalledWith()`, which asserts "called with no arguments"
            // — a different, wrong assertion.
            'vitest/prefer-called-with': 'off',
            // `charCodeAt` feeds the club accent hash, whose values must stay
            // stable; `codePointAt` differs on surrogate pairs and is nullable.
            'unicorn/prefer-code-point': 'off',

            'require-await': 'off',
            'typescript/require-await': 'off',
            'no-warning-comments': 'off',
            'no-console': [
                'error',
                {
                    allow: ['warn', 'error'],
                },
            ],
            'no-void': [
                'error',
                {
                    allowAsStatement: true,
                },
            ],
            'no-undefined': 'off',
            'import/no-default-export': 'error',
            'import/no-relative-parent-imports': 'error',
            'import/max-dependencies': [
                'error',
                {
                    max: 20,
                },
            ],
            'import/no-unassigned-import': [
                'error',
                {
                    allow: ['**/*.css', '**/*.svg'],
                },
            ],
            'max-lines': 'off',
            'max-lines-per-function': [
                'error',
                {
                    max: 200,
                },
            ],
            'react/forbid-component-props': ['error', { forbid: ['style'] }],
            // DataTable's `cell: (row) => ReactNode` column spec is a render
            // prop, not a stray component definition — every DataTable
            // consumer builds one of these per column.
            'react/no-unstable-nested-components': [
                'error',
                { allowAsProps: true },
            ],
            'react/react-in-jsx-scope': 'off',
            'react/only-export-components': 'off',
            'func-style': [
                'error',
                'declaration',
                {
                    overrides: {
                        namedExports: 'ignore',
                    },
                },
            ],
            'typescript/no-floating-promises': [
                'error',
                {
                    checkThenables: true,
                },
            ],
            'typescript/strict-boolean-expressions': 'off',
            'typescript/explicit-module-boundary-types': [
                'error',
                {
                    allowArgumentsExplicitlyTypedAsAny: true,
                },
            ],
            'typescript/no-unsafe-type-assertion': 'off',
            'typescript/prefer-readonly-parameter-types': 'off',
            'typescript/only-throw-error': 'off',
            'typescript/explicit-function-return-type': [
                'error',
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                },
            ],
            'jsx_a11y/anchor-is-valid': 'error',
            'react/jsx-filename-extension': [
                'error',
                {
                    extensions: ['.jsx', '.tsx'],
                },
            ],
        },
        // No `categories` block: Ultracite lists every rule explicitly because
        // category defaults leak rules into consumer configs.
        // `plugins` overwrites rather than merges, so this is the union of what
        // the core and react presets each declare.
        plugins: [
            'eslint',
            'typescript',
            'unicorn',
            'oxc',
            'import',
            'jsdoc',
            'node',
            'promise',
            'react',
            'react-perf',
            'jsx-a11y',
        ],
        ignorePatterns: [
            'node_modules/',
            'build/',
            'dist/',
            'static/',
            '.output/',
            '.tanstack/',
            'vite.config.ts',
            'drizzle.config.ts',
            'playwright.config.ts',
            'src/routeTree.gen.ts',
            'docs/design/',
            'src/components/ui/',
            '.claude/hooks/',
            '**/worker-configuration.d.ts',
            'src/vite-env.d.ts',
            'e2e/',
        ],
        overrides: [
            {
                files: ['**/*.{test,spec}.{ts,tsx,js,jsx}'],
                // Ultracite's vitest preset scopes its rules to an override that
                // declares this plugin, so switching one off has to happen in an
                // override of the same shape — a top-level rule never wins.
                plugins: ['vitest'],
                rules: {
                    'max-lines-per-function': 'off',
                    // Ultracite's vitest preset scopes its rules to test globs,
                    // so switching these off has to happen in an override too.
                    // Table-driven contract tests are the point here.
                    'vitest/max-expects': 'off',
                },
            },
            {
                // Thin CLI entrypoints: they must reach into src/ and they print.
                files: ['scripts/**'],
                rules: {
                    'import/no-relative-parent-imports': 'off',
                    'no-console': 'off',
                },
            },
            {
                files: ['src/test/**'],
                rules: {
                    'import/no-unassigned-import': 'off',
                },
            },
            {
                files: ['src/worker.ts'],
                rules: {
                    'import/no-default-export': 'off',
                },
            },
            {
                // TanStack Start dictates these names: file routes export
                // `Route`, and server handlers key off the HTTP verb.
                files: ['src/routes/**'],
                rules: {
                    'sonarjs/function-name': 'off',
                    'react-doctor/only-export-components': 'off',
                },
            },
            {
                // The PlayHQ ingestion boundary exists to carry unparsed JSON:
                // `cachedGraphQL` returns the raw envelope so callers can tell
                // "returned null" from "not fetched yet", `Record<string,
                // unknown>` is the D1 driver's own row type, and the `typeof`
                // checks here *are* the boundary parse these rules ask for.
                files: ['src/pipeline/fetch/**', 'src/pipeline/import/**'],
                rules: {
                    'anti-slop/no-unknown-returns': 'off',
                    'anti-slop/no-unknown-parameters': 'off',
                    'anti-slop/no-unsafe-dictionary-type': 'off',
                    'anti-slop/no-runtime-typeof': 'off',
                },
            },
        ],
    },
    run: {
        cache: true,
    },
    test: {
        // Node by default: pipeline, scoring and db logic are the bulk of the suite.
        // Component tests opt in per file with `// @vitest-environment jsdom`.
        environment: 'node',
        hookTimeout: 30_000,
        testTimeout: 15_000,
        include: ['src/**/*.test.{ts,tsx}'],
        coverage: {
            exclude: [
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.spec.ts',
                '**/*.fixtures.ts',
                'src/routeTree.gen.ts',
            ],
            include: ['src/**/*.{ts,tsx}'],
            provider: 'v8',
            reporter: ['text-summary', 'json', 'html'],
            thresholds: {
                branches: 0,
                functions: 0,
                lines: 0,
                statements: 0,
                'src/server/**': {
                    statements: 90,
                    functions: 85,
                    branches: 80,
                },
            },
        },
    },
});
