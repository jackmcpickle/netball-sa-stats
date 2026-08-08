import { resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
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
        experimentalTailwindcss: {
            stylesheet: './src/style.css',
            functions: ['cn', 'clsx', 'cva', 'cx'],
            attributes: ['class', 'classList', 'className'],
        },
        experimentalSortImports: {
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
        experimentalSortPackageJson: true,
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
        ],
    },
    lint: {
        options: { typeAware: true, typeCheck: true, denyWarnings: true },
        rules: {
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
        categories: {
            perf: 'error',
            restriction: 'error',
            correctness: 'error',
            suspicious: 'error',
            pedantic: 'error',
        },
        plugins: [
            'eslint',
            'typescript',
            'import',
            'react',
            'jsx-a11y',
            'react-perf',
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
            'src/routeTree.gen.ts',
            'docs/design/',
            'src/components/ui/',
            '.claude/hooks/',
            '**/worker-configuration.d.ts',
            'src/vite-env.d.ts',
        ],
        overrides: [
            {
                files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
                rules: {
                    'max-lines-per-function': 'off',
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
        ],
    },
    run: {
        cache: true,
    },
    test: {
        // Node by default: pipeline, scoring and db logic are the bulk of the suite.
        // Component tests opt in per file with `// @vitest-environment jsdom`
        // (needs the jsdom package, not installed yet).
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
            },
        },
    },
});
