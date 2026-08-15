import { isUndefined } from 'es-toolkit';
/**
 * PlayHQ GraphQL client: fixed headers, ~1req/sec rate limit, and a
 * cache-first fetch keyed by operation+id so re-runs never re-hit the
 * network unless `--refresh` is passed. Query strings are copied verbatim
 * from `docs/playhq-api.md` §2 — do not hand-edit them here.
 */
import type { CaptureStore } from '@/pipeline/fetch/capture-store';

const ENDPOINT = 'https://api.playhq.com/graphql';
const USER_AGENT =
    'netball-stats-fetch/1.0 (github.com/jackmcpickle/netball-sa-stats)';
const RATE_LIMIT_MS = 1200;

export const QUERIES = {
    discoverCompetitions:
        'query discoverCompetitions($organisationID: ID!) { discoverCompetitions(organisationID: $organisationID) { id name seasons(organisationID: $organisationID) { id name startDate endDate status { name value } } organisation { id name } } }',
    gradeListDiscoverSeason:
        'query gradeListDiscoverSeason($id: String!) { discoverSeason(seasonID: $id) { id name competition { id name type organisation { id name } } status { name value } grades { id name day { name value } gender { name value } age { name value } } } }',
    gradeLadder:
        'query gradeLadder($gradeID: ID!) { discoverGrade(gradeID: $gradeID) { id name ladderType ladder { pool { id name } standings { team { id name organisation { id name type } } played won lost drawn byes pointsFor pointsAgainst pointsDifference forfeits percentage competitionPoints } } } }',
    gradeAllRounds:
        'query gradeAllRounds($gradeID: ID!) { discoverGradeFixture(gradeID: $gradeID) { id name number abbreviatedName provisionalDates isFinalsRound grade { type hideScores } byes { id name organisation { id name type } } games { id alias pool { id name } home { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name organisation { id name type } } } away { ... on ProvisionalTeam { name } ... on DiscoverTeam { id name organisation { id name type } } } result { winner { name value } outcome { name value } home { outcome { name value } statistics { count type { value } } gameOutcomeDescription } away { outcome { name value } statistics { count type { value } } gameOutcomeDescription } } status { name value } date dates allocation { time court { id name venue { id name } } } } } }',
} as const;

type QueryName = keyof typeof QUERIES;

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
    const wait = lastRequestAt + RATE_LIMIT_MS - Date.now();
    if (wait > 0) {
        // oxlint-disable-next-line promise/avoid-new -- promisifying `setTimeout`, a callback timer API with no promise form.
        await new Promise<void>((resolve) => {
            setTimeout(resolve, wait);
        });
    }
    lastRequestAt = Date.now();
}

const MAX_ATTEMPTS = 6;

async function sleep(ms: number): Promise<void> {
    // oxlint-disable-next-line promise/avoid-new -- promisifying `setTimeout`, a callback timer API with no promise form.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function requestGraphQLOnce(
    operationName: QueryName,
    variables: Record<string, string>,
): Promise<Response> {
    await rateLimit();
    return await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            tenant: 'netball-australia',
            Origin: 'https://www.playhq.com',
            'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
            operationName,
            variables,
            query: QUERIES[operationName],
        }),
    });
}

/**
 * The public endpoint occasionally returns a transient 403/502 with no body
 * (edge-level, not a real auth/data failure — confirmed by immediate
 * success on retry). Retried a few times with backoff before giving up.
 */
async function requestGraphQL(
    operationName: QueryName,
    variables: Record<string, string>,
): Promise<unknown> {
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- retry-with-backoff is inherently sequential.
        const response = await requestGraphQLOnce(operationName, variables);
        if (response.ok) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- reads the body of the response this iteration just awaited; nothing to parallelise.
            return await response.json();
        }
        lastStatus = response.status;
        if (attempt < MAX_ATTEMPTS) {
            // Edge-level 403 bursts (CloudFront WAF) seem to need tens of
            // seconds to clear, not the sub-second backoff that suits a
            // genuine transient 502.
            // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- retry-with-backoff is inherently sequential.
            await sleep(10_000 * attempt);
        }
    }
    throw new Error(
        `PlayHQ ${operationName} failed after ${MAX_ATTEMPTS} attempts: HTTP ${lastStatus} (${JSON.stringify(variables)})`,
    );
}

/**
 * Cache-first GraphQL call. Returns the raw `{ data: ... }` envelope so
 * callers can distinguish "operation returned null" from "not fetched yet".
 */
export async function cachedGraphQL(
    store: CaptureStore,
    key: string,
    operationName: QueryName,
    variables: Record<string, string>,
    cacheFirst: boolean,
): Promise<unknown> {
    if (cacheFirst) {
        const cached = await store.get(key);
        if (!isUndefined(cached)) {
            return cached;
        }
    }
    const result = await requestGraphQL(operationName, variables);
    await store.put(key, result, Date.now());
    return result;
}
