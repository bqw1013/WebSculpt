// stocktwits/get-symbol-posts — discussion post stream for one Stocktwits symbol
// (the feed on stocktwits.com/symbol/{symbol}, e.g. AAPL stock or BTC.X crypto).
//
// Anonymous public JSON API: GET https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json
// No login, no API key, no browser. Node runtime (global fetch + AbortController).
//
// Endpoint facts verified by the explore trace (2026-08-20):
//   - filter enum is exactly: top (热门/默认) | all (最新) | bullish (看涨) | bearish (看跌).
//     "latest" is NOT valid — the API rejects it with HTTP 400, so the newest view is "all".
//   - The API caps limit at 30 per page (31/100 are silently truncated to 30).
//     Pages turn via the "max" cursor (last message id); cursor.more=false is the terminal state.
//   - A message object has NO url field — the output "url" is constructed as
//     https://stocktwits.com/{username}/message/{id}.
//   - "likes" is optional; missing likes -> likeCount 0. A symbol has no "sector" field.
//   - An invalid symbol returns HTTP 404 {"errors":[{"message":"Symbol not found"}]}.
//
// Polite pacing: random 200-700ms sleep before every request; 429/403/connection-error/5xx
// backoff retry (up to 3 attempts) then a clear error code.

const API_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FILTERS = ['top', 'all', 'bullish', 'bearish']; // 热门 / 最新 / 看涨 / 看跌
const PAGE_SIZE = 30; // single-page API cap (verified: 31+ silently truncated to 30)
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Fetch one API page. Random 200-700ms sleep before EVERY request (polite pacing).
// Retries 429/403/connection-error/5xx with backoff up to MAX_ATTEMPTS, then throws.
async function fetchJson(url) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(randomBetween(200, 700));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resp = null;
    try {
      resp = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        redirect: 'follow',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(800 * attempt);
        continue;
      }
      fail('NETWORK_ERROR', `Failed to fetch ${url}: ${err.message}`);
    }
    clearTimeout(timer);

    // 404 = the symbol does not exist (verified response body: "Symbol not found").
    if (resp.status === 404) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 300); } catch { /* ignore */ }
      fail('NOT_FOUND', `Symbol not found (HTTP 404) — the Stocktwits symbol does not exist. ${detail}`);
    }

    const retryable =
      resp.status === 429 || resp.status === 403 || (resp.status >= 500 && resp.status <= 599);
    if (retryable) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }
      if (resp.status === 429 || resp.status === 403) {
        fail('RATE_LIMITED', `Stocktwits rate-limited or blocked the request (HTTP ${resp.status}) after ${MAX_ATTEMPTS} attempts for ${url}`);
      }
      fail('API_ERROR', `Stocktwits API returned HTTP ${resp.status} after ${MAX_ATTEMPTS} attempts for ${url}`);
    }
    if (resp.status !== 200) {
      fail('API_ERROR', `Unexpected HTTP ${resp.status} from ${url}`);
    }

    const text = await resp.text();
    if (!text) {
      fail('API_ERROR', `Empty response body from ${url}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      fail('API_ERROR', `Response is not valid JSON from ${url}: ${err.message}`);
    }
    if (data && Array.isArray(data.errors) && data.errors.length > 0) {
      fail('API_ERROR', `Stocktwits API error: ${data.errors.map((er) => er.message).join('; ')}`);
    }
    return data;
  }
  fail('NETWORK_ERROR', `Failed to fetch ${url}: ${lastErr ? lastErr.message : 'unknown error'}`);
}

// Map the API symbol object -> output shape (no sector field exists on the API).
function mapSymbol(s) {
  return {
    id: typeof s.id === 'number' ? s.id : null,
    symbol: s.symbol ?? null,
    title: s.title ?? null,
    exchange: s.exchange ?? null,
    region: s.region ?? null,
    watchlistCount: typeof s.watchlist_count === 'number' ? s.watchlist_count : null,
    logoUrl: s.logo_url ?? null,
    instrumentClass: s.instrument_class ?? null
  };
}

// Map one API message -> output shape. likes is optional (default 0); the url is
// constructed from username + id because the API message carries no url field.
function mapMessage(m) {
  const u = m.user && typeof m.user === 'object' ? m.user : {};
  const likes = m.likes && typeof m.likes.total === 'number' ? m.likes.total : 0;
  const mentioned = Array.isArray(m.symbols)
    ? m.symbols.map((s) => ({
        symbol: s.symbol ?? null,
        title: s.title ?? null,
        exchange: s.exchange ?? null,
        logoUrl: s.logo_url ?? null,
        watchlistCount: typeof s.watchlist_count === 'number' ? s.watchlist_count : null
      }))
    : [];
  const url =
    u.username && typeof m.id === 'number'
      ? `https://stocktwits.com/${u.username}/message/${m.id}`
      : null;
  return {
    id: m.id ?? null,
    url,
    body: m.body ?? '',
    createdAt: m.created_at ?? null,
    sentiment:
      m.entities && m.entities.sentiment && typeof m.entities.sentiment.basic === 'string'
        ? m.entities.sentiment.basic
        : null,
    likeCount: likes,
    user: {
      id: typeof u.id === 'number' ? u.id : null,
      username: u.username ?? null,
      name: u.name ?? null,
      avatarUrl: u.avatar_url ?? null,
      followers: typeof u.followers === 'number' ? u.followers : null,
      ideas: typeof u.ideas === 'number' ? u.ideas : null
    },
    symbols: mentioned
  };
}

export default async function(params) {
  // ---- symbol (required) ----
  const rawSymbol = params.symbol == null ? '' : String(params.symbol).trim();
  if (rawSymbol === '') {
    fail('MISSING_PARAM', 'symbol is required — the cashtag without "$", e.g. "AAPL" or "BTC.X"');
  }
  const symbol = rawSymbol;

  // ---- filter (enum, default top) ----
  const rawFilter = params.filter == null ? '' : String(params.filter).trim();
  let filter = 'top';
  if (rawFilter !== '') {
    if (!FILTERS.includes(rawFilter)) {
      fail(
        'INVALID_PARAM',
        `filter must be one of: top (热门, default) | all (最新) | bullish (看涨) | bearish (看跌). Got "${rawFilter}". Note "latest" is NOT a valid Stocktwits filter (the API rejects it with 400) — use "all" for the newest view.`
      );
    }
    filter = rawFilter;
  }

  // ---- limit (default 20, 1-100) ----
  const rawLimit = params.limit == null ? '' : String(params.limit).trim();
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit)) {
      fail('INVALID_PARAM', `limit must be a positive integer between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      fail('INVALID_PARAM', `limit must be between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
  }

  // ---- paginate the stream (30/page via the max cursor) until limit or stream end ----
  const messages = [];
  let symbolInfo = null;
  let max = null;
  let more = true;
  let lastFirstId = null;

  while (more && messages.length < limit) {
    const qs = new URLSearchParams();
    qs.set('filter', filter);
    qs.set('limit', String(PAGE_SIZE));
    if (max !== null) qs.set('max', String(max));
    const url = `${API_BASE}/${encodeURIComponent(symbol)}.json?${qs.toString()}`;

    const data = await fetchJson(url);
    if (!data || !Array.isArray(data.messages)) {
      fail('API_ERROR', `Response missing "messages" array from ${url}`);
    }
    if (symbolInfo === null) {
      if (!data.symbol || typeof data.symbol !== 'object') {
        fail('API_ERROR', `Response missing "symbol" object from ${url}`);
      }
      symbolInfo = mapSymbol(data.symbol);
    }

    const pageMsgs = data.messages;
    for (const m of pageMsgs) {
      if (messages.length >= limit) break;
      messages.push(mapMessage(m));
    }

    const cursor = data.cursor && typeof data.cursor === 'object' ? data.cursor : {};
    more = cursor.more === true;
    if (cursor.max != null) {
      max = cursor.max;
    } else if (pageMsgs.length > 0 && pageMsgs[pageMsgs.length - 1].id != null) {
      // Fallback: cursor.max equals the last message id of the page (verified).
      max = pageMsgs[pageMsgs.length - 1].id;
    } else {
      max = null;
    }

    // Guard against an infinite loop: stop if a page yields nothing new
    // (empty page, or the cursor failed to advance and repeated the first id).
    if (pageMsgs.length === 0 || (lastFirstId !== null && pageMsgs[0].id === lastFirstId)) {
      break;
    }
    if (pageMsgs.length > 0) lastFirstId = pageMsgs[0].id;
  }

  if (symbolInfo === null) {
    fail('API_ERROR', 'No symbol info was returned for the requested symbol');
  }

  const partial = messages.length < limit;
  return { symbol: symbolInfo, messages, partial };
}
