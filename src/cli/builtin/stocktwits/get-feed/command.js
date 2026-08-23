// stocktwits/get-feed — fetch Stocktwits' site-wide trending feed (anonymous homepage content).
// Runtime contract consulted before writing this command.
// Verified 2026-08-20: anonymous trending JSON API.

const API_BASE = "https://api.stocktwits.com/api/2/streams/trending.json";
const PAGE_LIMIT = 30; // single API page cap (limit>30 silently truncated by the API)
const MAX_LIMIT = 100; // external --limit cap
const DEFAULT_LIMIT = 20;
const MAX_ATTEMPTS = 3; // retries on 429/403/connection errors

// Same Chrome UA used during exploration — the API serves fine without auth, UA keeps it stable.
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The API returns HTML-escaped entities inside the otherwise plain-text body (e.g. &quot;).
// Decode named + numeric entities so the contract's "plain text body" holds. &amp; is decoded
// last so a literal "&amp;quot;" stays as the literal text "&quot;" and is not double-decoded.
function decodeHtmlEntities(text) {
  return String(text == null ? "" : text)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

// Polite pacing: random 200-700ms before every HTTP request.
async function politeDelay() {
  await sleep(200 + Math.floor(Math.random() * 500));
}

// Validate --limit on the raw string (regex first, then parseInt — no parseInt truncation).
function parseLimit(raw) {
  const text = raw == null || raw === "" ? String(DEFAULT_LIMIT) : String(raw).trim();
  if (!/^\d+$/.test(text)) {
    commandError("INVALID_PARAM", `limit must be an integer between 1 and ${MAX_LIMIT}, got "${raw}"`);
  }
  const limit = parseInt(text, 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    commandError("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}, got "${raw}"`);
  }
  return limit;
}

// Map one API message to the contract output shape.
// likes.total only appears when total>0 (fallback 0); symbols from message.symbols[].symbol;
// sentiment from entities.sentiment.basic (Bullish|Bearish|null).
function normalizePost(message) {
  const user = message.user || {};
  const symbols = Array.isArray(message.symbols)
    ? message.symbols.map((s) => (s && s.symbol != null ? String(s.symbol) : null)).filter(Boolean)
    : [];
  const likesTotal =
    message.likes && Number.isInteger(message.likes.total) ? message.likes.total : 0;
  const basic = message.entities && message.entities.sentiment ? message.entities.sentiment.basic : null;
  const sentiment = basic === "Bullish" || basic === "Bearish" ? basic : null;
  const username = user.username != null ? String(user.username) : "";
  return {
    id: message.id != null ? message.id : null,
    // Permalink verified: https://stocktwits.com/{username}/message/{id} is the only 200 form.
    url: `https://stocktwits.com/${encodeURIComponent(username)}/message/${message.id}`,
    body: decodeHtmlEntities(message.body),
    createdAt: message.created_at || null,
    sentiment,
    likeCount: likesTotal,
    user: {
      id: user.id != null ? user.id : null,
      username: user.username || null,
      name: user.name || null,
      avatarUrl: user.avatar_url_ssl || user.avatar_url || null,
      followers: user.followers != null ? user.followers : null,
      ideas: user.ideas != null ? user.ideas : null
    },
    symbols
  };
}

// Fetch one page with polite delay + retry/backoff. Returns the parsed JSON envelope.
async function fetchTrendingPage(cursor) {
  const url =
    cursor == null
      ? `${API_BASE}?limit=${PAGE_LIMIT}`
      : `${API_BASE}?limit=${PAGE_LIMIT}&max=${cursor}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await politeDelay();
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA_CHROME } });
    } catch (fetchError) {
      lastError = fetchError;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 800); // backoff before retry
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 1200); // backoff for rate limit / challenge
        continue;
      }
      commandError(
        "RATE_LIMITED",
        `Stocktwits API rate-limited or challenged (HTTP ${res.status}) after ${MAX_ATTEMPTS} attempts`
      );
    }
    if (!res.ok) {
      commandError("API_ERROR", `Stocktwits API returned HTTP ${res.status}`);
    }
    let data;
    try {
      data = await res.json();
    } catch (jsonError) {
      commandError("DRIFT_DETECTED", `Stocktwits API returned a non-JSON response: ${jsonError.message}`);
    }
    return data;
  }

  // Only reached when every attempt failed with a network/connection error.
  commandError(
    "NETWORK_ERROR",
    `Failed to reach Stocktwits API after ${MAX_ATTEMPTS} attempts: ${lastError ? lastError.message : "unknown connection error"}`
  );
}

export default async function (params) {
  const limit = parseLimit(params.limit);

  const posts = [];
  let cursor = null;
  let partial = false;

  // Page at 30/page via the max cursor until we have `limit` posts or the stream ends.
  while (posts.length < limit) {
    const data = await fetchTrendingPage(cursor);
    if (!data || !Array.isArray(data.messages)) {
      commandError("DRIFT_DETECTED", "Stocktwits trending feed response no longer contains a messages array");
    }
    if (data.messages.length === 0) {
      // Empty page means the stream ran out.
      partial = true;
      break;
    }
    for (const message of data.messages) {
      if (posts.length >= limit) break;
      posts.push(normalizePost(message));
    }
    const more = Boolean(data.cursor && data.cursor.more === true);
    if (!more) {
      // Stream exhausted before (or exactly at) the requested limit.
      partial = posts.length < limit;
      break;
    }
    if (posts.length >= limit) break; // reached the requested limit; stream has more — not partial
    if (data.cursor && data.cursor.max != null) {
      cursor = data.cursor.max;
    } else {
      // cursor says more but gives no max — treat as exhausted to avoid an infinite loop.
      partial = true;
      break;
    }
  }

  return { posts, partial };
}
