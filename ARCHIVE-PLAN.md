# Pre-PlayHQ era — archive backfill

Deferred companion to [PLAN.md](./PLAN.md). **Not part of the main build.** Nothing here is required for the site to ship; it extends coverage backwards once the PlayHQ-era product works.

## What this covers

| Era     | Seasons         | Source                                    | Status                                                                  |
| ------- | --------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Archive | 2000–2014, 2016 | Final Premiership Placings PDFs (Wayback) | Built — see `docs/superpowers/plans/2026-08-08-archive-pdf-backfill.md` |
| Missing | 2015, 2017–2021 | —                                         | Unrecoverable from public sources; timeline shows a break               |

Sixteen AMND seasons of placement data, verified present and parseable. AMND only — no Premier League archive was found.

## Why it is separate

The archive era is a **different dataset wearing the same shape**, and merging it into the main plan degrades the main product:

1. **Placement only, no stats.** No played/won/lost, no goals, no percentage. Every stat column is null, so win rate, goal percentage, and the entire club-profile stat block are blank for 2000–2016.
2. **Contaminated top 4.** The PDFs are "Final Premiership Placings" — positions 1–4 may reflect finals outcomes, not the minor-round ladder. PlayHQ-era rows are true ladders. Charting them as one series compares two different measurements.
3. **A six-season hole** sits between the eras (2015, 2017–2021), immediately before the switch — so any combined trend line has both a gap and a methodology change at the same point.
4. **No match data, ever.** Head-to-head and round results cannot exist pre-2022.

Kept apart, each dataset is internally consistent. Merged carelessly, neither is trustworthy.

## Source detail

Sixteen PDFs, all archived under `amnd.sa.netball.com.au/files/40002/files/`:

```
2000–2005   "<year> Final Placings.pdf"
2006–2007   "<year> AMND Final Placings.pdf"
2008–2009   "<year> AMND Final Premiership Placings.pdf"
2010        "2010 Final Premiership Placings.pdf"
2011–2014   "<year> AMND Final Premiership Placings.pdf"
2016        "2016 AMND Final Premiership Placings.pdf"
```

Fetch via `https://web.archive.org/web/<timestamp>id_/<url>`. Verified 2026-08-08: the 2016 PDF returns 200, 91KB, 5 pages, and parses cleanly with `pdftotext -layout`.

**No 2015 PDF exists** despite the site's navigation listing a 2015 entry.

### Format

Four grades laid out side-by-side per page:

```
   AMND LEAGUE            A. GRADE                 B. 1                  B. 2
 1st   Tango           1st   Flames          1st   Swish          1st   Swish
2nd    Contax         2nd    Oakdale Phoenix 2nd   Adelaide Wildcats ...
3rd    Matrics        3rd    Contax          3rd   Pembroke O.S.
```

Parsing must be **column-aware** — use `pdftotext -bbox` x-coordinates or fixed column bands. Naive line splitting interleaves four unrelated grades.

Rows are ordinal (`1st`, `2nd`, …) plus a team name. Nothing else.

## Work required

1. **Fetch** — download 16 PDFs from Wayback to `data/raw/archive/`, committed. One-time; the source is frozen.
2. **Parse** — column-aware extraction → `data/archive/*.csv` matching the main entity schema.
3. **Grade mapping** — archive grade names (`AMND LEAGUE`, `A. GRADE`, `B. 1`, `C.1`, `Inter. 3`, `Junior 5`, …) → `tier` / `division`, reusing the main plan's taxonomy. Names drift across 16 years; expect per-year exceptions.
4. **Club alias curation** — the largest manual task. Sixteen years of spelling drift, plus mergers, renames and folds. Unknown names fail loudly per the main plan; each one is resolved by hand into `club_aliases`.
5. **Flagging** — every row gets `source = 'archive_pdf'`, `placement_basis = 'final_premiership_placings'`, and `position_uncertain = 1` where `ladder_position <= 4`.
6. **UI treatment** — decide how the two eras coexist visually before importing anything.

## Schema

**No schema changes needed.** The main plan already carries `source`, `placement_basis`, `position_uncertain`, and nullable stat columns specifically so this data can land later without a migration. That was deliberate — those columns cost nothing now and are expensive to add once the table has rows.

Two things the archive relies on that the main schema already handles:

- `squad_number` — clubs field multiple teams per grade in this era too (`Walkerville (1)` / `(2)`, `Pembroke O.S. (1)` / `(2)`).
- `team_count` — derivable by counting rows per grade in the PDF, so grade size is recoverable.

## Open questions

- **How do the two eras render together?** Options: separate charts, one chart with a visual break at the gap, or an era toggle. Needs deciding before import, not after.
- **Does the championship score span eras at all?** Archive scores are computable (position + grade size + weight are all present), but they mix minor-round and finals-derived placings. A cross-era ranking may be indefensible even when it is computable.
- **Are the top-4 rows worth keeping?** `position_uncertain` preserves them with a caveat. Nulling them instead would be more conservative and lose the most interesting results.
- **Is `Final Placings` (2000–2005) the same measurement as `Final Premiership Placings` (2008+)?** The rename may signal a definition change. Worth checking a year where both interpretations are testable.
- **Premier League archive** — none found. Unknown whether Netball SA published equivalent historical placings anywhere.

## Not in scope

- 2015 and 2017–2021. See PLAN.md for the ResultsVault investigation — the platform host is gone, and Wayback captured no populated ladders because the UI ran on ASP.NET form postbacks. Recovering these needs Netball SA, AMND, or club internal records.
