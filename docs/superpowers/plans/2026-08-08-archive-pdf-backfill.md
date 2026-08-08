# Archive PDF Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AMND archive seasons (2000–2014, 2016) from Wayback PDFs through CSV/D1 into a single championship timeline with a labeled methodology/gap break.

**Architecture:** New `fetch-archive` pipeline downloads and parses PDFs into staging CSVs, resolves clubs/grades with fail-loud aliases, merges into committed `data/*.csv`, then reuses `import-csv`. UI/coverage/championship suppress movement across the archive→PlayHQ gap and render a visual break for missing years.

**Tech stack:** TypeScript, Vitest, `pdftotext` (poppler), existing Drizzle/D1 import path, React charts/coverage components.

**Design:** [docs/superpowers/specs/2026-08-08-archive-pdf-backfill-design.md](../specs/2026-08-08-archive-pdf-backfill-design.md)

---

## File map

| Path                                    | Role                                              |
| --------------------------------------- | ------------------------------------------------- |
| `scripts/fetch-archive.ts`              | CLI entry                                         |
| `src/pipeline/archive/sources.ts`       | Year → Wayback URL + expected filename            |
| `src/pipeline/archive/fetch-pdfs.ts`    | Download + cache to `data/raw/archive/`           |
| `src/pipeline/archive/parse-pdf.ts`     | Column-aware extraction → placement rows          |
| `src/pipeline/archive/grade-map.ts`     | Per-year grade header → tier/division exceptions  |
| `src/pipeline/archive/resolve.ts`       | Club alias resolution (fail loud) + synthetic IDs |
| `src/pipeline/archive/merge.ts`         | Staging → append/update main `data/*.csv`         |
| `src/pipeline/archive/run.ts`           | Orchestration                                     |
| `data/raw/archive/*.pdf`                | Committed raw PDFs                                |
| `data/archive/`                         | Staging CSVs / parse fixtures                     |
| `src/db/queries/coverage.ts`            | Methodology break + gap years in coverage         |
| `src/db/queries/championship.ts`        | Suppress movement across era/gap                  |
| `src/components/coverage-note.tsx`      | Copy for archive + gap                            |
| `src/components/method/method-page.tsx` | Placement-basis explanation                       |
| `src/components/charts/*`               | Timeline break rendering                          |
| `ARCHIVE-PLAN.md`                       | Mark status built / point to this plan            |

---

### Task 1: PDF source catalog + fetch

**Files:**

- Create: `src/pipeline/archive/sources.ts`
- Create: `src/pipeline/archive/fetch-pdfs.ts`
- Create: `src/pipeline/archive/sources.test.ts`
- Create: `scripts/fetch-archive.ts` (stub wiring)

- [ ] **Step 1: Write failing test** for the 16 year→filename mappings (2000–2014, 2016) and that 2015/2017–2021 are absent.

- [ ] **Step 2: Implement `sources.ts`** with Wayback `id_` URLs under `amnd.sa.netball.com.au/files/40002/files/` per ARCHIVE-PLAN naming.

- [ ] **Step 3: Implement fetcher** — 1 req/s, descriptive User-Agent, write `data/raw/archive/<year>-final-placings.pdf`, skip if present and non-empty; fail on non-PDF/HTTP error.

- [ ] **Step 4: Run fetch once**, commit the 16 PDFs.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/archive scripts/fetch-archive.ts data/raw/archive
git commit -m "Add archive PDF source catalog and Wayback fetch"
```

---

### Task 2: Column-aware PDF parser

**Files:**

- Create: `src/pipeline/archive/parse-pdf.ts`
- Create: `src/pipeline/archive/parse-pdf.test.ts`
- Create: `data/archive/fixtures/` (pdftotext -bbox samples from 1–2 years)

- [ ] **Step 1: Extract fixture text** from 2016 (and one 2000–2005) via `pdftotext -bbox` / `-layout`; commit fixtures.

- [ ] **Step 2: Write failing tests** — four grades side-by-side do not interleave; ordinals map to positions; squad suffixes `(1)`/`(2)` preserved.

- [ ] **Step 3: Implement parser** using x-coordinate bands (or fixed bands from bbox). Output rows: `{ year, gradeName, ladderPosition, teamName, squadNumber }`.

- [ ] **Step 4: Smoke-parse all 16 PDFs**; assert every grade has contiguous positions `1..n`.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/archive data/archive/fixtures
git commit -m "Parse archive premiership PDFs with column-aware extraction"
```

---

### Task 3: Grade mapping + club resolve + synthetic IDs

**Files:**

- Create: `src/pipeline/archive/grade-map.ts`
- Create: `src/pipeline/archive/resolve.ts`
- Create: `src/pipeline/archive/resolve.test.ts`
- Extend: `src/pipeline/fetch/grade-name.ts` only if archive headers need new rules
- Extend: `data/club_aliases.csv` (and `clubs.csv` when new clubs appear)

- [ ] **Step 1: Failing tests** for archive headers (`AMND LEAGUE`, `A. GRADE`, `B. 1`, `Inter. 3`, …) and fail-loud unknown club names.

- [ ] **Step 2: Implement grade mapping** reusing `parseGradeName`; table of per-year exceptions for drifted headers.

- [ ] **Step 3: Implement resolve** — lookup alias (case/punctuation normalised); unknown → throw listing year/grade/name; synthetic `playhq_id = archive:{season_key}:{grade_slug}:{club_key}:{squad}`.

- [ ] **Step 4: First full resolve run** — collect unknown names; curate aliases until clean (largest manual step).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/archive data/clubs.csv data/club_aliases.csv
git commit -m "Resolve archive grades and club aliases with synthetic team ids"
```

---

### Task 4: Staging CSVs + merge into `data/*.csv`

**Files:**

- Create: `src/pipeline/archive/merge.ts`
- Create: `src/pipeline/archive/run.ts`
- Wire: `scripts/fetch-archive.ts`
- Update: `data/seasons.csv`, `grades.csv`, `teams.csv`, `team_season_results.csv`

- [ ] **Step 1: Emit staging entity rows** under `data/archive/` matching import headers; flags per design.

- [ ] **Step 2: Merge** into main CSVs without clobbering PlayHQ rows (key by season_key / grade_key / team natural key).

- [ ] **Step 3: Seasons** — `amnd-winter-{year}`, `source=archive_pdf`, `is_final=1`, `competition_period=winter`.

- [ ] **Step 4: Run `vp test` on archive + import validation** against merged CSVs (or fixture subset).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/archive scripts/fetch-archive.ts data/
git commit -m "Merge archive seasons into committed entity CSVs"
```

---

### Task 5: Import path verification

**Files:**

- Possibly extend: `src/pipeline/import/validate.test.ts` with archive fixture
- Create: `src/pipeline/import/__fixtures__/archive-smoke/` (small)

- [ ] **Step 1: Add fixture** with one archive season + PlayHQ season proving both sources import.

- [ ] **Step 2: Run import locally** (`vp run` / `scripts/import-csv.ts` against local D1).

- [ ] **Step 3: Confirm** ranked years include archive years; stats null; top-4 uncertain.

- [ ] **Step 4: Commit**

```bash
git add src/pipeline/import
git commit -m "Verify import accepts archive_pdf result rows"
```

---

### Task 6: Championship movement across era/gap

**Files:**

- Modify: `src/db/queries/championship.ts`
- Modify: `src/pipeline/scoring/championship.ts` and/or coverage helpers if needed
- Modify: `src/pipeline/scoring/championship.test.ts`
- Modify: `src/db/queries/coverage.ts`, `src/data/types.ts`

- [ ] **Step 1: Failing tests** — movement null from 2016→2022; `coverageChanged` true at era boundary; gap years not fabricated as ranked.

- [ ] **Step 2: Implement era/gap suppression** — consecutive ranked years with non-adjacent calendar years OR source/placement_basis change ⇒ no arrows.

- [ ] **Step 3: Coverage model** — expose methodology break note (archive vs PlayHQ) alongside existing competition-entry `changeNote` (or extend type).

- [ ] **Step 4: Commit**

```bash
git add src/db src/pipeline/scoring src/data/types.ts
git commit -m "Suppress championship movement across archive gap and era break"
```

---

### Task 7: Timeline UI break + copy

**Files:**

- Modify: `src/components/coverage-note.tsx`
- Modify: `src/components/method/method-page.tsx`
- Modify: `src/components/charts/points-bar-chart.tsx` (and rank movement chart if present)
- Modify: club profile / home rankings as needed
- Modify: `ARCHIVE-PLAN.md` status

- [ ] **Step 1: Coverage copy** — ranked span includes archive; state missing 2015/2017–2021; explain Final Premiership Placings vs ladders.

- [ ] **Step 2: Charts** — insert visible break/spacer for gap years (not outlined “not ranked” slots that imply the club simply missed those years when the dataset has no season).

- [ ] **Step 3: Method page** — document placement bases, uncertain top 4, null stats pre-2022.

- [ ] **Step 4: `vp check` && `vp test`**

- [ ] **Step 5: Commit**

```bash
git add src/components ARCHIVE-PLAN.md
git commit -m "Render archive era on one timeline with methodology break"
```

---

## Defaults locked for open ARCHIVE-PLAN questions

- Eras: one timeline + visual break
- Championship spans eras with caveat
- Top 4 kept with `position_uncertain=1`
- Gap years left empty for later backfill
- No Premier League archive in this work
