# PlayHQ API — discovery spike

Verified 2026-08-08 against the production `netball-australia` tenant. All
requests below were actually executed with `curl` (rate-limited to ~1
req/sec, `User-Agent` identifying this project). Raw responses are saved
under `data/raw/probe/`.

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
  CloudFront/Envoy, no GraphQL error. See
  `data/raw/probe/auth_probe_no_origin_404.json` (empty, 404) vs
  `data/raw/probe/auth_probe_origin_only_200.json` (200,
  `{"data":{"__typename":"Query"}}`).
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

Response: `data/raw/probe/discoverCompetitions_netballsa_6fefc037.json` (Netball SA,
5 competitions incl. "The Hospital Research Foundation Premier League") and
`data/raw/probe/discoverCompetitions_amnd_7a5f35e1.json` (AMND, 2 competitions).

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

Response: `data/raw/probe/gradeLadder_premier_2023_3c7d2b13.json` (2023
Premier Division, 8 teams) and
`data/raw/probe/gradeLadder_amnd_winter2023_junior1_2b0f8026.json` (AMND
Junior 1, cross-check that the same shape holds for a club-tier grade).

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

| Season | Season ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Premier grade ID                                                | Reserves grade ID                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| 2022   | **unknown / not found** — `d4d09c75` returns `discoverSeason: null` (verified `data/raw/probe/gradeListDiscoverSeason_premier_2022_d4d09c75_NULL.json`). Not present in `discoverCompetitions` for org `6fefc037` either — that call's Premier League entry (`0e0cfad5`) only lists seasons 2023-2026. Could not find a 2022 Premier League season on PlayHQ because it did not run: COVID-19 cancelled the 2022 Premier League/Reserves season, so there is no PlayHQ record to find. | unknown                                                         | unknown                          |
| 2023   | `fdb84e54` (confirmed, matches brief)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `3c7d2b13` "Premier Division"                                   | `a63edcfa` "Reserves Division"   |
| 2024   | `6b351c9a` (confirmed present in `discoverCompetitions`, not independently re-queried — trusted from controller-supplied known-good list)                                                                                                                                                                                                                                                                                                                                              | `6ab303e4` (controller-supplied, not independently re-verified) | `9bc4481a` (controller-supplied) |
| 2025   | `3b0a635f` (confirmed present in `discoverCompetitions`)                                                                                                                                                                                                                                                                                                                                                                                                                               | `9a8085ed` (controller-supplied)                                | `6073b8c7` (controller-supplied) |
| 2026   | `b6ba0f43` (confirmed, matches brief)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `a95c2301` "Premier Division"                                   | `ae6df43a` "Reserves Division"   |

Note the 2024/2025 grade IDs given in the brief were treated as known-good
per the brief's instructions and not re-fetched; only the season IDs were
independently confirmed via `discoverCompetitions`.

**AMND Winter 2023**: confirmed to exist. Season ID `7570c2c4`, part of
competition `bd4b4c9f` ("AMND Competition", org `7a5f35e1`), 43 grades
(Junior 1-N, Senior grades etc). See
`data/raw/probe/gradeListDiscoverSeason_amnd_winter2023_7570c2c4.json`.
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

## Unknowns / open items

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
