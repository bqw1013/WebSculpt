// stocktwits/list-polls — Stocktwits community polls list (stocktwits.com/discussions).
// Anonymous SSR page, no login, no browser, no API key. Node runtime.
//
// The page is Next.js getServerSideProps (__N_SSP=true): the latest 50 polls are
// embedded in the HTML inside <script id="__NEXT_DATA__" type="application/json" ...>.
// Verified during explore + capture (2026-08-20):
//   - props.pageProps.data.polls is a FIXED array of 50 polls, newest-first,
//     mixing active + ended states; status is kept verbatim.
//   - props.pageProps.data.response is only {status: 200} — no cursor/page/total
//     metadata, and the decompiled page component pure-maps data.polls with no
//     fetch/load-more logic. There is NO pagination; a limit above the embedded
//     count is silently truncated and partial=true is set.
//   - symbols come from associations where type === "stock" (always present in the
//     live sample). discussionMessage.symbols is a richer object array and is
//     missing on 9/50 polls — deliberately not used.
//   - messageId = discussion.discussionMessage.id; the discussion URL template is
//     https://stocktwits.com/discussions/{discussion.slug}/{messageId}.
//   - No rate limiting observed (10 rapid-fire requests all HTTP 200), but the
//     command keeps a random 200-700ms pre-request sleep and backoff-retries
//     429/403/404/5xx/network errors up to 3 attempts.

const DISCUSSIONS_URL = 'https://stocktwits.com/discussions';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_LIMIT = 20;
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 30000;
const MIN_BODY = 1000;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polite pacing: random 200-700ms before EVERY request.
function randomDelayMs() {
  return 200 + Math.floor(Math.random() * 500);
}

function isRetryableStatus(status) {
  return status === 429 || status === 403 || status === 404 || status >= 500;
}

// Extract the __NEXT_DATA__ JSON from the SSR HTML. The script tag carries extra
// attributes (e.g. crossorigin="anonymous"), so [^>]* is used after type=.
function parseNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Map one raw poll object to the output schema. Tolerates missing/odd fields.
function mapPoll(poll) {
  const disc =
    poll && typeof poll === 'object' && poll.discussion && typeof poll.discussion === 'object'
      ? poll.discussion
      : {};
  const msg =
    disc.discussionMessage && typeof disc.discussionMessage === 'object'
      ? disc.discussionMessage
      : {};
  const slug = typeof disc.slug === 'string' ? disc.slug : '';
  const messageId = typeof msg.id === 'number' ? msg.id : null;

  const symbols = Array.isArray(poll.associations)
    ? poll.associations
        .filter(
          (a) =>
            a && typeof a === 'object' && a.type === 'stock' &&
            typeof a.symbol === 'string' && a.symbol
        )
        .map((a) => a.symbol)
    : [];

  const choices = Array.isArray(poll.choices)
    ? poll.choices
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          title: typeof c.title === 'string' ? c.title : '',
          percent: typeof c.percent === 'number' ? c.percent : null
        }))
    : [];

  return {
    id: typeof poll.id === 'number' ? poll.id : null,
    status: typeof poll.status === 'string' ? poll.status : '',
    question: typeof poll.question === 'string' ? poll.question : '',
    description: typeof poll.description === 'string' ? poll.description : '',
    totalVotes: typeof poll.totalVotes === 'number' ? poll.totalVotes : null,
    startsAt: typeof poll.startsAt === 'string' ? poll.startsAt : '',
    expiresAt: typeof poll.expiresAt === 'string' ? poll.expiresAt : '',
    createdAt:
      typeof msg.createdAt === 'string'
        ? msg.createdAt
        : typeof disc.createdAt === 'string'
          ? disc.createdAt
          : '',
    symbols,
    messageId,
    discussionUrl:
      slug && messageId != null
        ? `https://stocktwits.com/discussions/${slug}/${messageId}`
        : null,
    commentsCount: typeof disc.commentsCount === 'number' ? disc.commentsCount : 0,
    choices
  };
}

// Fetch the /discussions HTML with a polite pacing sleep, timeout, and backoff-retry
// for transient failures (429/403/404/5xx/network), up to MAX_ATTEMPTS.
async function fetchDiscussionsHtml() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(randomDelayMs());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(DISCUSSIONS_URL, {
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt); // 1s, 2s backoff
        continue;
      }
      fail('NETWORK_ERROR', `Failed to fetch ${DISCUSSIONS_URL}: ${err.message}`);
    }
    clearTimeout(timer);

    if (resp.status === 200) {
      const text = await resp.text();
      if (!text || text.length < MIN_BODY) {
        fail(
          'API_ERROR',
          `Truncated response from ${DISCUSSIONS_URL} (${text ? text.length : 0} bytes)`
        );
      }
      return text;
    }

    if (isRetryableStatus(resp.status) && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt); // 1s, 2s backoff
      continue;
    }

    if (resp.status === 429 || resp.status === 403) {
      fail(
        'RATE_LIMITED',
        `Stocktwits rate-limited or blocked the request (HTTP ${resp.status}) for ${DISCUSSIONS_URL}`
      );
    }
    if (resp.status === 404) {
      fail('NOT_FOUND', `Stocktwits discussions page returned HTTP 404 — the URL may have moved`);
    }
    fail('API_ERROR', `Unexpected HTTP ${resp.status} from ${DISCUSSIONS_URL}`);
  }
  fail('API_ERROR', `Failed to fetch ${DISCUSSIONS_URL} after ${MAX_ATTEMPTS} attempts`);
}

export default async function (params) {
  // ---- limit (default 20; the page serves a fixed 50 with no pagination) ----
  const rawLimit = params.limit == null ? '' : String(params.limit).trim();
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit)) {
      fail('INVALID_PARAM', `limit must be a positive integer, got: "${rawLimit}"`);
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      fail('INVALID_PARAM', `limit must be a positive integer, got: "${rawLimit}"`);
    }
  }

  // ---- fetch + parse ----
  const html = await fetchDiscussionsHtml();
  const data = parseNextData(html);
  if (!data) {
    fail('DRIFT_DETECTED', '__NEXT_DATA__ block not found on /discussions — the SSR structure may have changed');
  }

  const polls =
    data.props && data.props.pageProps && data.props.pageProps.data
      ? data.props.pageProps.data.polls
      : null;
  if (!Array.isArray(polls)) {
    fail('DRIFT_DETECTED', 'props.pageProps.data.polls is missing or not an array — the SSR structure may have changed');
  }

  const mapped = polls.map(mapPoll).filter((p) => p.id != null);
  if (mapped.length === 0) {
    fail('EMPTY_RESULT', 'The discussions page returned no polls');
  }

  const partial = mapped.length < limit;
  return { polls: mapped.slice(0, limit), partial };
}
