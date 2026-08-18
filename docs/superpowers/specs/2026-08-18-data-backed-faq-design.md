# Data-backed FAQ — design

Date: 2026-08-18

## Problem

Home and Method already share one `FaqEntry[]` between the visible page,
FAQPage JSON-LD, and the markdown twin. Club profiles, and the site as a
whole, have no equivalent. The Home list is also static: it cannot name the
current leader, the ranked year span, or an in-progress season, so it goes
stale the moment an import lands.

The unit of identity on this site is the **club**, not a grade squad. There
is no `/teams/$id` route.

## Decisions

- **Per club**, not per grade squad. Club Q&A lives on `/clubs/$clubKey`.
- Answers are **derived from the page’s own data** (or a small FAQ DTO built
  from the same repos). No KV, no FAQ table, no extra cache store. D1 only
  changes when an import runs.
- **`/faq` is the site-wide list.** Linked from the footer Data column only
  — not the header nav.
- **Home keeps a short season-only list.** Those questions must not appear
  on `/faq`. Duplicate FAQPage schema across URLs is out of scope.
- **Method FAQ is unchanged.** `METHOD_FAQ` stays a static list.
- **A question is omitted**, not guessed, when that club or season has no
  fact for it.
- **`/faq` is cached for a week** (`Cache-Control: public, max-age=604800`)
  on both HTML and markdown. Home and club pages stay uncached at the edge:
  they are paginated and must reflect the current table state.
- The weekly TTL is a **freshness bound**, not a second source of truth.
  After an import, the next cache miss rebuilds from D1. No purge hook in
  this cycle.

## 1. Page map

| Page              | List                   | Source         |
| ----------------- | ---------------------- | -------------- |
| `/faq`            | Site-wide, data-backed | `buildSiteFaq` |
| `/`               | This season only       | `buildHomeFaq` |
| `/clubs/$clubKey` | That club only         | `buildClubFaq` |
| `/method`         | Unchanged              | `METHOD_FAQ`   |

No question text is reused on two of these pages.

## 2. Questions

Answers are plain, self-contained sentences: an answer lifted out of
context still has to be true. Names, years, and counts are interpolated
from the DTO. Method-shaped answers (how the score is calculated, score vs
strength) stay in the current wording unless a figure they mention is now
available from coverage.

### `/faq`

1. What is the South Australian netball club championship? — include who
   leads the latest ranked season and that season’s year, when a leader
   exists.
2. Which competitions and seasons are covered? — real year span,
   competition names, named timeline gaps.
3. How is a club championship score calculated?
4. What is the difference between championship score and club strength?
5. Where does the data come from? — PlayHQ vs archive, plus fixture-level
   coverage from the earliest year that has games (omit the fixture clause
   if there are no games).
6. Are in-progress seasons ranked? — name years whose `SeasonStatus` is
   `in-progress`. Do not treat `absent` years (e.g. Premier League 2022)
   as in progress.
7. How do I find a club’s results? — point at `/clubs`, `/results`, and
   `/head-to-head`. Mention fixture coverage only when games exist.

### Home

Uses the **selected** ranked season (`data.season.year`), not always the
latest.

1. Who is leading the {year} club championship?
2. How many clubs are in the {year} standings? — `totalRows` for that
   season, not the all-time `clubCount` on the DTO.
3. How many seasons are ranked, and is a season still in progress?

The leader is the row with `rank === 1` on the **unsorted** season. Table
sort and page must not change the answer.

### Club profile

1. What is {name}’s latest championship rank? — omit when `currentRank` is
   null.
2. What is {name}’s best championship finish? — omit when `bestRank` or
   `bestRankYear` is null.
3. How many career championship points and minor premierships does {name}
   have?
4. What is {name}’s win rate since 2022? — omit when `winPercentage` is
   null.
5. Who has {name} played most often since 2025? — the first `topOpponents`
   entry; omit when the list is empty.

Home venue is not a question: PlayHQ does not publish it today, so the
answer would almost always be omitted.

## 3. Architecture

One `FaqEntry` shape (`question`, `answer`). Three pure builders. The same
array is passed to `FaqSection`, `faqSchema()` in `head()`, and the
markdown `faqBlock` — the existing rule that schema cannot drift from the
page.

```
repos / existing page DTO
        │
        ▼
 buildSiteFaq | buildHomeFaq | buildClubFaq
        │
        ├── FaqSection (HTML)
        ├── faqSchema (JSON-LD)
        └── faqBlock (markdown twin)
```

### Builders — `src/seo/faq.ts`

- Keep `METHOD_FAQ`.
- Remove the static `HOME_FAQ` export.
- Export `buildSiteFaq`, `buildHomeFaq`, `buildClubFaq`.
- Each builder returns `readonly FaqEntry[]` and drops entries whose
  required facts are missing.

`buildHomeFaq` takes the rankings page DTO (including the new `leader`
field). `buildClubFaq` takes the club profile page DTO. `buildSiteFaq`
takes a dedicated `FaqPageDto` (below) so `/faq` does not pretend to be
the rankings table.

### Leader — `Championship` and `RankingsPageDto`

`Championship` gains a `leader()` method: the row with `rank === 1`, or
`null` when the season has no rows.

`RankingsPageDto` gains:

```
leader: { club, points, teams } | null
```

filled from `championship.value.leader()` **before** `sorted()`. Home
`head()` reads `loaderData` and calls `faqSchema(buildHomeFaq(loaderData))`,
the same `loaderData` pattern the club route already uses for
`describeClub`.

### `/faq` route and service

New files:

- `src/routes/faq.tsx`
- `src/server/dto/faq.dto.ts` — `FaqPageDto`
- `src/server/services/faq.service.ts` — `getPage()`
- `src/components/faq/faq-page.tsx` — heading, one-line intro, `FaqSection`

`FaqPageDto`:

```
coverage: Coverage
latestRankedYear: number | null
leader: { club, points, teams } | null
fixtureFromYear: number | null
```

`FaqService.getPage()`:

1. `repos.seasons.fullCoverage()`
2. `latestRankedYear` is the last entry of `coverage.rankedYears` (that
   array is ascending), or `null` if it is empty
3. If a latest year exists, `repos.championship.history()` →
   `Championship.fromHistory` → `leader()`. A `fromHistory` miss sets
   `leader` to `null` and still returns 200 — `/faq` is not a season
   page
4. `repos.games.earliestYear()`: the earliest season year that has at
   least one `games` row, or `null`. Do not hardcode 2025

The route has no search params. A true loader `Result` error uses
`resolvePageResult` / the shared public error page.

`head()` title: `Common questions`. Description names the site and that
answers are built from the published dataset.

### Footer

In `SiteFooter`, Data column, add a `Link` to `/faq` labelled `FAQ`,
alongside Method and About. Explore and header nav are unchanged.

### Markdown, sitemap, agents

- `renderFaq(data)` in `src/seo/markdown/pages.ts`
- `/faq` added to `MARKDOWN_PATHS` and the resolver
- `renderRankings` uses `buildHomeFaq(data)` instead of `HOME_FAQ`
- `renderClubProfile` appends `faqBlock(buildClubFaq(data))`
- Rankings “Other pages” and `llmsTxt` pages list gain FAQ
- Sitemap static entries: `/faq`, `changefreq: 'weekly'`, `priority: '0.6'`

### Cache headers

- `/faq` HTML: `Cache-Control: public, max-age=604800`
- `/faq.md` (and `Accept: text/markdown` for `/faq`): same week-long
  header, overriding the generic markdown `max-age=300`
- Home, club, and every other HTML page: no new cache header

Set the HTML header on the `/faq` route response. In `markdownTwin`,
when the normalised path is `/faq`, use `max-age=604800` instead of
`300`.

## 4. Empty and error cases

- No ranked seasons: site FAQ skips the leader clause; Home skips the
  leader question; coverage and method questions still render.
- Empty `{year}` standings (`totalRows === 0`): Home skips the leader
  question; the club-count answer may still say zero clubs.
- Club unranked / no best finish / no win rate / no fixtures: that
  question is dropped.
- Unknown `clubKey`: existing club 404. No FAQ.
- `/faq` loader `Result` error: same `resolvePageResult` path as other
  public routes.

## 5. Testing

Builder tests against the existing seed fixtures:

- Home names the rank-1 club even when the DTO’s `season.rows` are
  sorted or paged away from rank 1.
- Home club-count uses that season’s `totalRows`, not all-time club
  count.
- In-progress years are named; `absent` years are not.
- Club builder omits win-rate and opponent questions on a profile with
  null `winPercentage` and empty `topOpponents`.
- Site builder omits the fixture clause when `fixtureFromYear` is null;
  includes the real year when it is set.

Route / SEO tests:

- `/faq` is 200 and emits `FAQPage` JSON-LD whose questions match the
  visible list.
- Sitemap and `llms.txt` mention `/faq`.
- `/faq.md` is 200 and contains the same questions.
- Existing Home and Method FAQ tests are updated for the builders; Method
  still uses `METHOD_FAQ`.

## Out of scope

- FAQ on ladders, results, clubs index, head-to-head, or about
- Per-grade-squad pages or Q&A
- KV / D1 materialisation / cache purge on import
- Editing FAQ copy in admin
- Changing Method questions
