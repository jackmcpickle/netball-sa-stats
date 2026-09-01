# PlayHQ API — discovery spike

Verified 2026-08-08 against the production `netball-australia` tenant. All
requests below were actually executed with `curl` (rate-limited to ~1
req/sec, `User-Agent` identifying this project). Raw responses belong in
the local `data/raw/` cache or R2, not git.

Introspection on `https://api.playhq.com/graphql` is disabled (404), so the
operations below were recovered by fetching PlayHQ's own web app bundle
(`https://www.playhq.com/assets/index.<hash>.js`, ~320 KB unminified-ish JS)
and grepping the embedded `query`/`mutation` template strings.

## 1. Auth / headers required

Endpoint: `POST https://api.playhq.com/graphql`

Required headers:

- `Content-Type: application/json`
- `tenant: netball-australia`
- `Origin: https://www.playhq.com` — **required**. Omitting it (even with a
  legitimate browser `User-Agent`) gets HTTP 404 with an empty body from
  CloudFront/Envoy, no GraphQL error. Verified: no `Origin` → empty 404;
  `Origin` only → 200 `{"data":{"__typename":"Query"}}`.
- `Referer` is **not** required once `Origin` is present (tested).
- No `Authorization` header, API key, or cookie is required for any
  `discover*` / `gradeLadder` query — these are the same public
  (unauthenticated) queries the anonymous spectator site uses. The server
  does set `phq_session`/`phq_sub` cookies on response but they are not
  needed on subsequent requests (not sent, still worked).
- No persisted-query IDs (APQ) were observed — the app sends the full query
  document as `query` in the JSON body, not a hash.

The plain org page (`https://www.playhq.com/...`) itself 403s from
CloudFront when curl's default `User-Agent` is used; a browser-like
`User-Agent` string is enough to get past that (this is unrelated to the
GraphQL API's `Origin` requirement — two separate CloudFront distributions).

**Rate limiting**: none observed at ~1 req/sec over ~15 requests. No
`Retry-After` or 429 seen. Not stress-tested further per the brief's
self-imposed limit.

## 2. Discovery chain: org → seasons → grades → ladder

Three operations, chained by ID:

### `discoverCompetitions($organisationID: ID!)`

Given an org ID (the short hex ID from the org's PlayHQ URL, e.g. `7a5f35e1`
for AMND), returns every **competition** the org runs, each with its
**seasons** (id, name, startDate, endDate, status).

```
curl -X POST https://api.playhq.com/graphql \
  -H 'Content-Type: application/json' -H 'tenant: netball-australia' \
  -H 'Origin: https://www.playhq.com' -H 'User-Agent: <project UA>' \
  -d '{"operationName":"discoverCompetitions",
       "variables":{"organisationID":"6fefc037"},
       "query":"query discoverCompetitions($organisationID: ID!) { discoverCompetitions(organisationID: $organisationID) { id name seasons(organisationID: $organisationID) { id name startDate endDate status { name value } } organisation { id name } } }"}'
```

Response (not committed): Netball SA has 5 competitions including
"The Hospital Research Foundation Premier League"; AMND has 2.

South Australian associations verified the same way on 2026-08-22 (this cloud
VM was not blocked). Each org also lists carnivals / schools / summer;
`collect` only walks the catalogued PlayHQ competition name (and, where winter
and summer share one object, the matching season name).

| Catalogue key         | Org ID     | PlayHQ org name                                     | Competition name                | Period collected    |
| --------------------- | ---------- | --------------------------------------------------- | ------------------------------- | ------------------- |
| `saucna`              | `fb89f1f1` | SA United Church Netball Association                | `SAUCNA Winter`                 | winter 2023+        |
| `suna`                | `4bd9b8ae` | Southern United Netball Association                 | `SUNA Winter`                   | winter 2023+ (2026) |
| `elizabeth`           | `7ffb0e67` | Elizabeth Netball Association                       | `Elizabeth Netball Association` | winter seasons only |
| `city_night_division` | `2276ec85` | City Night Division                                 | `City Night Division 1`         | summer 2023+        |
| `sammna`              | `7936878d` | South Australian Mens and Mixed Netball Association | `M League`                      | winter seasons only |

`COLLECT_JOBS` in `src/pipeline/fetch/collect.ts` includes these org IDs.
Target one with `pnpm exec tsx scripts/fetch-playhq.ts --competition=saucna --year=2025`.
Do not invent season IDs. Read them from the probe or a live
`discoverCompetitions` response. Grade lists from one completed winter each
are under `gradeListDiscoverSeason_*` in the same folder. Import is not wired
to those ladders yet: unknown club names fail loud, and there are no
championship weights.

PlayHQ org slugs that match those ids: `elizabeth-netball-association`,
`south-australian-mens-and-mixed-netball-association` (sammna.com.au),
`city-night-division`. City Night's public index only listed 2021. The 2023+
job walks `City Night Division 1` summer from GraphQL.

Do not use WA SADNA `489c7576`, NSW Hills District `cd26c84e`, Netball SA
Country carnival `b0bbe786`, or Adelaide Plains / BLGNA *-rep orgs. Season
ids come from `discoverCompetitions`, not invented slugs. New association
jobs start at 2023.

Note: a single logical competition (e.g. Premier League) can be split
across **multiple `discoverCompetitions` entries** if PlayHQ re-created the
competition object at some point — AMND has a separate "AMND 2022" entry
(1 season: Winter 2022) distinct from "AMND Competition" (Winter 2023-2026).
When resolving season IDs, iterate _all_ returned competition entries for
the org, not just the one whose name matches the current sponsor.

### `gradeListDiscoverSeason($id: String!)`

Given a season ID, returns the season's **grades** (id, name, day, gender,
age — no team count, no ladder here).

```
curl -X POST https://api.playhq.com/graphql \
  -H 'Content-Type: application/json' -H 'tenant: netball-australia' \
  -H 'Origin: https://www.playhq.com' -H 'User-Agent: <project UA>' \
  -d '{"operationName":"gradeListDiscoverSeason",
       "variables":{"id":"fdb84e54"},
       "query":"query gradeListDiscoverSeason($id: String!) { discoverSeason(seasonID: $id) { id name competition { id name type organisation { id name } } status { name value } grades { id name day { name value } gender { name value } age { name value } } } }"}'
```

Responses saved for: 2023 Premier League season (`fdb84e54`), 2026 Premier
League season (`b6ba0f43`), AMND Winter 2023 (`7570c2c4`), and the unknown
2022 Premier League season ID (`d4d09c75`, returns `discoverSeason: null` —
see §3).

### `gradeLadder($gradeID: ID!)`

Given a grade ID, returns the ladder. This is the target query.

```
curl -X POST https://api.playhq.com/graphql \
  -H 'Content-Type: application/json' -H 'tenant: netball-australia' \
  -H 'Origin: https://www.playhq.com' -H 'User-Agent: <project UA>' \
  -d '{"operationName":"gradeLadder",
       "variables":{"gradeID":"3c7d2b13"},
       "query":"query gradeLadder($gradeID: ID!) { discoverGrade(gradeID: $gradeID) { id name ladderType ladder { pool { id name } standings { team { id name organisation { id name type } } played won lost drawn byes pointsFor pointsAgainst pointsDifference forfeits percentage competitionPoints } } } }"}'
```

Response (not committed): 2023 Premier Division had 8 teams. The same
ladder shape holds for an AMND Junior 1 grade.

The full field set the app requests (from the bundle) also includes
sport-specific fields for other codes PlayHQ serves (cricket: `runsFor`,
`oversFaced`, `wicketsLost`...; rugby: `tryBonus`, `triesFor`...) which are
irrelevant to netball and were dropped from our probe query.

## 3. Ladder field mapping vs `team_season_results`

| Our column          | PlayHQ field                                                        | Verified?                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| team name           | `standings[].team.name`                                             | yes                                                                                                                                                                                                                                            |
| ladder position     | **not a field** — implicit in array order of `ladder[].standings[]` | yes (inferred, no explicit rank/position field exists anywhere in `gradeLadder`)                                                                                                                                                               |
| played              | `played`                                                            | yes                                                                                                                                                                                                                                            |
| won                 | `won`                                                               | yes                                                                                                                                                                                                                                            |
| lost                | `lost`                                                              | yes                                                                                                                                                                                                                                            |
| drawn               | `drawn`                                                             | yes                                                                                                                                                                                                                                            |
| byes                | `byes`                                                              | yes                                                                                                                                                                                                                                            |
| goals for           | `pointsFor`                                                         | yes                                                                                                                                                                                                                                            |
| goals against       | `pointsAgainst`                                                     | yes                                                                                                                                                                                                                                            |
| goal difference     | `pointsDifference`                                                  | **present but always `0`** in every response sampled (8 rows across 2 different grades, non-zero pointsFor/pointsAgainst), i.e. PlayHQ does not compute it for netball. Must be derived as `pointsFor - pointsAgainst`, not read from the API. |
| percentage / goal % | `percentage`                                                        | yes (`goals for / goals against * 100`, matches our schema's definition)                                                                                                                                                                       |
| points              | `competitionPoints`                                                 | yes                                                                                                                                                                                                                                            |
| shots attempted     | no such field anywhere in `gradeLadder` or its schema fragments     | **absent**                                                                                                                                                                                                                                     |
| shots scored        | no such field                                                       | **absent**                                                                                                                                                                                                                                     |

So `shots_attempted` and `shots_scored` in `team_season_results` (`src/db/schema.ts`)
**can never be populated from PlayHQ** — netball ladders don't track shooting
stats at this level, only scores (`pointsFor`/`pointsAgainst`, i.e. our
`goals_for`/`goals_against`). `goal_difference` is nominally present in the
API response but useless (always 0) and should be computed at import time
instead of read from PlayHQ.

`forfeits`, `disqualifications`, `adjustments`, `alternatePercentage`,
`pointsAverage`, `noResults`, `ties`, `quotient` also exist on `standings`
but have no corresponding column in our schema (out of scope here, noted
for awareness — `forfeits` was 0 in all samples so not urgent).

## 4. Season/grade ID table

| Season | Season ID                                                                                                                                                                                                                                                                                                                                                                                          | Premier grade ID                                                | Reserves grade ID                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| 2022   | **unknown / not found** — `d4d09c75` returns `discoverSeason: null`. Not present in `discoverCompetitions` for org `6fefc037` either — that call's Premier League entry (`0e0cfad5`) only lists seasons 2023-2026. Could not find a 2022 Premier League season on PlayHQ because it did not run: COVID-19 cancelled the 2022 Premier League/Reserves season, so there is no PlayHQ record to find. | unknown                                                         | unknown                          |
| 2023   | `fdb84e54` (confirmed, matches brief)                                                                                                                                                                                                                                                                                                                                                              | `3c7d2b13` "Premier Division"                                   | `a63edcfa` "Reserves Division"   |
| 2024   | `6b351c9a` (confirmed present in `discoverCompetitions`, not independently re-queried — trusted from controller-supplied known-good list)                                                                                                                                                                                                                                                          | `6ab303e4` (controller-supplied, not independently re-verified) | `9bc4481a` (controller-supplied) |
| 2025   | `3b0a635f` (confirmed present in `discoverCompetitions`)                                                                                                                                                                                                                                                                                                                                           | `9a8085ed` (controller-supplied)                                | `6073b8c7` (controller-supplied) |
| 2026   | `b6ba0f43` (confirmed, matches brief)                                                                                                                                                                                                                                                                                                                                                              | `a95c2301` "Premier Division"                                   | `ae6df43a` "Reserves Division"   |

Note the 2024/2025 grade IDs given in the brief were treated as known-good
per the brief's instructions and not re-fetched; only the season IDs were
independently confirmed via `discoverCompetitions`.

**AMND Winter 2023**: confirmed to exist. Season ID `7570c2c4`, part of
competition `bd4b4c9f` ("AMND Competition", org `7a5f35e1`), 43 grades
(Junior 1-N, Senior grades etc).
PLAN.md's inability to find it was likely because it sits under "AMND
Competition" rather than a separately named "AMND 2023" competition (unlike
2022, which does get its own competition entry) — the discovery chain has
to walk every competition entry per org, every season per competition.

## 5. Verdict

**Pure HTTP fetch is viable.** No browser automation needed. Three plain
`POST /graphql` calls (`discoverCompetitions` → `gradeListDiscoverSeason` →
`gradeLadder`) with a fixed set of headers (`Content-Type`, `tenant`,
`Origin: https://www.playhq.com`) resolve org → seasons → grades → ladder
end to end, unauthenticated, and were confirmed working against both AMND
and Netball SA orgs and against club-tier and Premier-League-tier grades.
The one gotcha is the `Origin` header — without it every request 404s from
the edge with no GraphQL error body, which could easily be misread as "this
operation doesn't exist" if not tested carefully.

## 6. Fixtures: `gradeAllRounds($gradeID: ID!)`

Verified 2026-08-12 against the same tenant, same headers as §1, no auth.
Recovered from bundle `https://www.playhq.com/assets/index.3dcc83db.js` by
grepping `query <name>` and reading the operation bodies.

Four candidates carry fixture data. `gradeAllRounds` is the one to use:

| Operation                | Root field               | Why not                                            |
| ------------------------ | ------------------------ | -------------------------------------------------- |
| `discoverFixtureByRound` | `discoverFixtureByRound` | Needs a `roundID` — one request per round.         |
| `discoverFixtureByDate`  | `discoverFixtureByDate`  | Needs a `gameDate` — one request per playing date. |
| `gradeRounds`            | `discoverGrade.rounds`   | Round list only, no games.                         |
| **`gradeAllRounds`**     | `discoverGradeFixture`   | **Whole grade, every round, one request.**         |

`discoverGradeFixture` returns an **array of rounds**, each with its `games`
and its `byes`. Field set below is the app's query with the cricket/rugby
statistics, logos and `tenantConfiguration` dropped, as §2 did for the ladder:

```
curl -X POST https://api.playhq.com/graphql \
  -H 'Content-Type: application/json' -H 'tenant: netball-australia' \
  -H 'Origin: https://www.playhq.com' -H 'User-Agent: <project UA>' \
  -d '{"operationName":"gradeAllRounds",
       "variables":{"gradeID":"a95c2301"},
       "query":"query gradeAllRounds($gradeID: ID!) { discoverGradeFixture(gradeID: $gradeID) { id name number abbreviatedName provisionalDates isFinalsRound grade { type hideScores } byes { id name organisation { id name type } } games { id alias pool { id name } home { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name organisation { id name type } } } away { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name organisation { id name type } } } result { winner { name value } outcome { name value } home { outcome { name value } statistics { count type { value } } gameOutcomeDescription } away { outcome { name value } statistics { count type { value } } gameOutcomeDescription } } status { name value } date dates allocation { time court { id name venue { id name } } } } } }"}'
```

`number` and `abbreviatedName` are not in the app's own `gradeAllRounds`
selection but are valid on the round type (added here and confirmed 200) —
`number` is what the spec's `games.round` column wants.

### Pagination

**None.** No `limit`/`after`/`cursor` argument exists on `discoverGradeFixture`.
Premier Division 2026 (`a95c2301`, 8 teams) returned all **17 rounds / 60
games** in a single 57 KB response. Reserves 2026 returned 17 rounds / 76
games at 75 KB. One request per grade.

### Field mapping onto `games`

| Our column       | PlayHQ field                                                                 | Verified |
| ---------------- | ---------------------------------------------------------------------------- | -------- |
| `playhqId`       | `games[].id`                                                                 | yes      |
| `round`          | round `number`                                                               | yes      |
| `roundName`      | round `name` (e.g. `Round 1`); finals carry `games[].alias` (`Semi Final 1`) | yes      |
| `playedAt`       | `games[].date` (`YYYY-MM-DD`) + `allocation.time` (`HH:MM:SS`), local        | yes      |
| `homeTeamId`     | `games[].home.id` → `teams.playhq_id`                                        | yes      |
| `awayTeamId`     | `games[].away.id`                                                            | yes      |
| `homeScore`      | `result.home.statistics[type.value == "TOTAL_SCORE"].count`                  | yes      |
| `awayScore`      | `result.away.statistics[...]`                                                | yes      |
| `status`         | derived — see below                                                          | yes      |
| `forfeitingSide` | derived from `result.outcome.value`                                          | yes      |

`TOTAL_SCORE` is the **only** statistic type present on netball games. The
score is not a scalar field; it is a one-element array that must be looked up
by `type.value`.

### Answers to the spike's questions

**Score field, and unplayed games.** `result` is `null` exactly when
`status.value == "UPCOMING"`, and non-null exactly when `FINAL` — across all
six grades sampled, with no exceptions and no zero-filled placeholder. A
`FINAL` always carried a `TOTAL_SCORE` for both sides (0 games with an empty
statistics array). So `status` derives cleanly:

| Condition                                                   | `status`    |
| ----------------------------------------------------------- | ----------- |
| team appears in round `byes[]`                              | `bye`       |
| `outcome.value` matches `*_FORFEIT` or `*_DISQUALIFICATION` | `forfeit`   |
| `outcome.value` is `CANCELLED` / `ABANDONED`                | `no_result` |
| `result != null`, both scores present                       | `final`     |
| `result == null`, `status == UPCOMING`                      | `scheduled` |
| `result == null`, `status == PENDING`                       | `no_result` |
| `result == null`, `status == FINAL`                         | `no_result` |

**Corrected 2026-08-12 by the full 2025/2026 backfill** (~5,500 games, 90
grades), which found two cases the four-grade sample did not:

- **`CANCELLED`** (1 game) is an `outcome.value` _and_ a `status.value`, and it
  carries a fabricated **0–0** `TOTAL_SCORE` on both sides. Read as a scored
  outcome it becomes a 0–0 draw in two clubs' records, which is why unknown
  outcomes must fail loudly rather than default.
- **`PENDING`** (20 games) is a game whose date has passed but whose score was
  never entered. It is not `UPCOMING`: mapping it to `scheduled` would leave
  finished games sitting in the fixture list forever.

An unrecognised **status** now fails loudly too, for the same reason as an
unrecognised outcome.

`FINAL` with a `null` result is still never observed; it stays as the safe
fallback rather than a case seen in the wild.

**Forfeits.** Represented as an `outcome.value`, not a flag:
`HOME_TEAM_WON_BY_FORFEIT`, `AWAY_TEAM_WON_BY_FORFEIT`, `DOUBLE_FORFEIT`, with
per-side `result.<side>.outcome.value` of `WON_BY_FORFEIT` / `LOST_BY_FORFEIT`.
Confirmed on game `36f8dab8` (AMND Junior 8 2024, `3723a749`): South Adelaide
0 – Reynella 1 20, `AWAY_TEAM_WON_BY_FORFEIT`.

**Disqualifications.** Same mapping as a forfeit (`status = forfeit`, losing
side in `forfeitingSide`). Confirmed on game `08d91477` (AMND Junior 9B 2026,
`e5a0898b`): Grange Silver 9B 5 – Glengowrie 9D 18,
`AWAY_TEAM_WON_BY_DISQUALIFICATION`, per-side `LOST_BY_DISQUALIFICATION` /
`WON_BY_DISQUALIFICATION`. The scoreline is the on-court result, not a
fabricated 0–20, but the outcome is disciplinary, so goals are excluded the
same way as a forfeit. `HOME_TEAM_WON_BY_DISQUALIFICATION` is mapped the same
way and has not been seen in a capture yet.

**A forfeit carries a synthetic 0–20 scoreline.** This contradicts the design
spec's assumption that a forfeit "contributes a result but no goals" via absent
scores — the scores are present and fabricated by PlayHQ. Goal totals must be
filtered on `status != 'forfeit'`, not on "both scores present", or every
head-to-head goal differential absorbs phantom 20-goal margins.

**Byes.** Not games. A bye is an entry in the **round-level** `byes: [Team]`
array, and the team appears in no game that round. Confirmed on Reserves 2026
(`ae6df43a`), 9 rounds each with one bye team. The spec's `games` row for a bye
(one team, one null side) therefore has to be **synthesised** from `byes[]`; it
does not come back from the API as a game. PlayHQ can list the same team twice
in one `byes[]` (SAUCNA Winter 2026 A1 `c125201c`, Round 1, Scotch A); the
mapper keeps one row per `(round, team)`.

**Draws.** `outcome.value == "DRAW_BY_SCORE"` with `winner == null` and equal
scores. Confirmed in AMND A Grade 2026 (`98973113`, 3 draws) and three other
grades — common enough that a mapping which assumes a winner is wrong.

**Team ids match `gradeLadder`.** Premier 2026 fixture team ids
(`9965376c` Contax, `3ac22eae` Garville, `e7e6387c` Oakdale) are exactly the
`ladder[].standings[].team.id` values in
`data/raw/gradeLadder_a95c2301.json` — all 8 ids match. The join to
`teams.playhq_id` holds, so no name matching is needed.

**`ProvisionalTeam`.** `home`/`away` are a union. Finals fixtures scheduled
before qualification can return a `ProvisionalTeam` (name only, **no `id`**).
Not observed in the samples taken, but the union is in the app's own query, so
the mapping must handle an id-less side rather than assume `DiscoverTeam`.

### Observed enum values

- `status.value`: `UPCOMING`, `FINAL`. (`IN_PROGRESS`, `CANCELLED` exist in
  the bundle, not seen.)
- `result.outcome.value`: `HOME_TEAM_WON_BY_SCORE`, `AWAY_TEAM_WON_BY_SCORE`,
  `DRAW_BY_SCORE`, `AWAY_TEAM_WON_BY_FORFEIT`,
  `AWAY_TEAM_WON_BY_DISQUALIFICATION`. The bundle additionally defines
  `HOME_TEAM_WON_BY_FORFEIT`, `DOUBLE_FORFEIT`, `ABANDONED`, `CANCELLED`,
  `HOME_TEAM_WON_BY_DISQUALIFICATION`, `*_BY_PENALTY_SHOOTOUT`, `DLS`.

Note the bundle's client-side enum does **not** contain the `*_BY_SCORE` or
`DRAW_BY_SCORE` values that every real response returns, so it is not an
exhaustive list of what the server sends. The mapping must **fail loudly on an
unrecognised outcome** rather than defaulting it — silently treating an unknown
outcome as a normal win is how a forfeit ends up scored 0–20 in a club's record.

### Finals restart their round numbering

`discoverGradeFixture` numbers finals rounds from 1 again, so a grade has both
a "Round 1" and a "Finals Round 1" (Premier 2026: 14 regular rounds, then
finals rounds 1–3). Left alone, a semi final sorts in among the season opener.
The mapping shifts finals past the last regular round and records
`isFinalsRound` as `games.is_finals`.

That flag is not cosmetic: **a ladder covers the regular season only**, so any
reconciliation of games against `team_season_results` has to exclude finals or
every finalist appears to have won more games than its ladder row credits.

### Grading rounds: a team's games are not confined to its own grade

Junior competitions play grading rounds, then regrade. A team's ladder row —
and so its `teams.csv` row — lives in the grade it _finished_ in, while its
first games sit in the grade it started in. Across 2025/2026 this affects
**430 of 5,509 games (7.8%) over 63 grades**.

Games therefore resolve a team by `playhq_id` **season-wide, not grade-scoped**
as the ladder import does. PlayHQ team ids are globally unique (verified: 6,565
ids, none used by two teams), and `checkTeamIdsGloballyUnique` enforces that at
import, since the database's `(grade_id, playhq_id)` index does not.

One team in 2025/2026 appears on no ladder in any grade — a Matrics side that
forfeited round 1 and never played again. Such a game is reported and skipped,
never imported against an invented team.

### Sampling done

Spike: `a95c2301` Premier 2026, `ae6df43a` Reserves 2026, `98973113` AMND A
Grade 2026, `3723a749` AMND Junior 8 2024, plus seven more scanned for outcome
distribution — ~700 games, 11 grades. Raw captures stay in the local
cache or R2, not git.

Full backfill (2026-08-12): all 90 grades of 2025 and 2026, 5,509 games.
Cross-checked against ladders with `scripts/check-games.ts`: **5 mismatches
across 674 team-season rows**, none systematic — two teams whose grading-round
games were played under a different team id, three single win/draw
disagreements of the kind `PlayedMismatchWarning` already documents as upstream
inconsistency.

### Verdict

**Gate passes.** Public, unauthenticated, one request per grade, no
pagination, and the team ids join to what we already store. Fixture ingestion
can proceed.

## Unknowns / open items

- `ProvisionalTeam` (id-less finals side) **does occur**: Premier 2026's
  Preliminary and Grand Finals both have two undecided sides. They import as
  `scheduled` with null teams rather than inventing one.
- `no_result` (`FINAL` with a `null` result) was never observed even across the
  full backfill; the status derivation covers it untested.
- `DOUBLE_FORFEIT` and `ABANDONED` still never observed, so their score shape
  is unknown. `forfeitingSide` carries `'both'` for a double forfeit — the
  spec's `'home' | 'away'` could not express it.
- Only **one** forfeit exists in all of 2025/2026 (plus the 2024 probe grade),
  so the forfeit path is real but barely exercised by production data.
- Whether `games[].pool` matters — `null` in every fixture sampled, same open
  question as `gradeLadder`'s `pool` below.
- 2022 Premier League season/grade IDs: not found on PlayHQ at all (see §4).
  Task 2 needs a decision on whether 2022 is out of scope for the PlayHQ
  pipeline or sourced from the archive-PDF pipeline instead.
- Whether `discoverCompetitions`' `seasons` list is exhaustive or has an
  undocumented page size — only tested with orgs that had ≤5 seasons per
  competition entry, never saw a `limit`/`after` argument in the query
  signature so probably not paginated, but not proven for an org with many
  more seasons.
- Whether `gradeLadder`'s `pool` (used for split conferences/pools) ever
  matters for AMND/Premier League — always `null` in samples taken, not
  tested against a grade known to have pools.
- Full rate-limit ceiling: not tested beyond ~15 requests at ~1/sec; no 429
  observed but the true limit is unknown.
