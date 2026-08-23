// stocktwits/get-user — profile + post stream for a Stocktwits user.
// Runtime: node. Anonymous REST against the public JSON API:
//   GET https://api.stocktwits.com/api/2/streams/user/{username}.json
// No login, no cookie, no signature, no browser — only a Chrome UA header.
//
// Verified 2026-08-20 (see this workspace's evidence.md).
//
// Key platform facts:
//   - One request returns the user profile + first page of posts.
//   - Pagination: body.cursor = {more, since, max}; pass `max={cursor.max}` for
//     the next strictly-older page; `more=false` = end of stream.
//   - Single page hard-caps at 30 posts (limit=31/100 still returns 30).
//   - Profile-level like count is a PLAIN number (user.like_count); post likes
//     is an OBJECT (message.likes.total). Distinguished by position.
//   - filter: top (default) | bullish | bearish | all. `latest` is INVALID for
//     user streams (HTTP 400) — unlike symbol streams.
//   - Missing user -> HTTP 404 {"errors":[{"message":"User not found"}]}.
//   - Connection-level throttle (explore-reproduced): rapid no-sleep bursts drop
//     the ~5th NEW connection at TCP level (curl 28 SYN timeout, no HTTP
//     response), recovering after a short pause. => fetch connection errors MUST
//     back off and retry (up to 3 attempts), never fail on the first drop.

const API_BASE = "https://api.stocktwits.com/api/2/streams/user/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 30000;
const MAX_LIMIT = 100; // command-level output cap (1-100)
const PAGE_SIZE = 30; // API single-page hard cap
// filter 枚举（用户流）: top 热门/默认 | bullish 看涨 | bearish 看跌 | all 全部。latest 非法（400）。
const FILTERS = new Set(["top", "bullish", "bearish", "all"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

// 礼貌限速：每次 HTTP 请求前随机 sleep 200-700ms。
async function antiCrawlSleep() {
  await sleep(200 + Math.floor(Math.random() * 500));
}

// Convert a possibly-string/number value to a number; null when absent/blank/NaN.
function toNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
}

// GET a JSON endpoint with polite pacing sleep + retry:
//   - transport/connection errors (TCP drop, SYN timeout, abort) -> random backoff retry (max 3)
//   - HTTP 429/403 -> backoff retry honoring Retry-After (max 3)
// Returns { status, body } (body may be null for non-JSON responses). 4xx/5xx other
// than 429/403 are NOT retried — the caller maps them to the right error code.
async function requestJson(url) {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await antiCrawlSleep();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempts >= 3) {
        fail(
          "NETWORK_ERROR",
          `Request to ${url} failed after 3 attempts: ${e instanceof Error ? e.message : String(e)}`
        );
      }
      // 连接被静默丢弃（平台实测）：随机退避几秒后重试，通常立即恢复。
      await sleep(600 + Math.floor(Math.random() * 700) + 1000 * attempts);
      continue;
    }
    clearTimeout(timer);

    if (res.status === 429 || res.status === 403) {
      if (attempts >= 3) {
        fail("RATE_LIMITED", `Stocktwits rate-limited or blocked the request (HTTP ${res.status}) for ${url}`);
      }
      const retryAfterMs = toNum(res.headers.get("retry-after")) * 1000 || 0;
      await sleep(retryAfterMs || 1000 * attempts + Math.floor(Math.random() * 500));
      continue;
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON body (e.g. HTML challenge). The caller decides whether this is fatal.
    }
    return { status: res.status, body };
  }
}

// Map a profile object -> output user object.
function mapUser(u, username) {
  return {
    id: u.id ?? null,
    username: u.username || username,
    name: u.name || "",
    avatarUrl: u.avatar_url || null,
    joinDate: u.join_date || null,
    official: !!u.official,
    followers: toNum(u.followers),
    following: toNum(u.following),
    ideas: toNum(u.ideas),
    watchlistStocksCount: toNum(u.watchlist_stocks_count),
    likeCount: toNum(u.like_count),
    plusTier: u.plus_tier || "",
    badges: Array.isArray(u.badges)
      ? u.badges.map((b) => ({
          type: b.type || null,
          showIcon: b.show_icon || null,
        }))
      : [],
  };
}

// Map a message object -> output post object. Old posts may lack likes/symbols,
// so every optional field defaults gracefully.
function mapMessage(msg, username) {
  const sentiment =
    msg.entities && msg.entities.sentiment && msg.entities.sentiment.basic
      ? msg.entities.sentiment.basic
      : null;
  const author = msg.user || {};
  const likeCount = msg.likes && typeof msg.likes.total === "number" ? msg.likes.total : 0;
  const symbols = Array.isArray(msg.symbols)
    ? msg.symbols
        .map((s) => (s && typeof s.symbol === "string" ? s.symbol : null))
        .filter(Boolean)
    : [];
  return {
    id: msg.id ?? null,
    // 帖子 permalink：API 不返回 url，按契约构造（展示用，不保证可解析）。
    url: `https://stocktwits.com/${username}/message/${msg.id}`,
    body: msg.body || "",
    createdAt: msg.created_at || null,
    sentiment,
    likeCount,
    user: {
      id: author.id ?? null,
      username: author.username || "",
      name: author.name || "",
      avatarUrl: author.avatar_url || null,
      followers: toNum(author.followers),
      ideas: toNum(author.ideas),
    },
    symbols,
  };
}

export default async function (params) {
  // username 必填（大小写敏感），如 fredwilson / Stocktwits。
  const username = String(params.username || "").trim();
  if (!username) {
    fail("MISSING_PARAM", "username is required: the user's handle, e.g. fredwilson or Stocktwits");
  }

  // filter 枚举校验：top 热门(默认) | bullish 看涨 | bearish 看跌 | all 全部。latest 对用户流非法（400）。
  const filter = String(params.filter).toLowerCase();
  if (!FILTERS.has(filter)) {
    fail(
      "INVALID_PARAM",
      `filter must be one of: top (热门, default) | bullish (看涨) | bearish (看跌) | all (全部). ` +
        `Note: 'latest' is NOT valid for user streams (HTTP 400).`
    );
  }

  // limit 1-100（默认 20）：输出条数上限，内部按 30/页翻页。先正则校验原始串再转换，防 parseInt 截断。
  const rawLimit = String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    fail("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (limit < 1 || limit > MAX_LIMIT) {
    fail("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}`);
  }

  const baseUrl = `${API_BASE}${encodeURIComponent(username)}.json`;
  const pageLimit = Math.min(limit, PAGE_SIZE);

  let userProfile = null;
  let pinnedMessage = null;
  const posts = [];
  let cursor = null;
  let partial = false;

  for (;;) {
    const qs = [`limit=${pageLimit}`, `filter=${filter}`];
    if (cursor !== null) qs.push(`max=${cursor}`);
    const url = `${baseUrl}?${qs.join("&")}`;

    const { status, body } = await requestJson(url);

    if (status === 404) {
      fail("NOT_FOUND", `user "${username}" not found on Stocktwits`);
    }
    if (status === 400) {
      const serverMsg =
        body && body.errors && body.errors[0] && body.errors[0].message
          ? body.errors[0].message
          : "bad request";
      fail(
        "INVALID_PARAM",
        `Stocktwits rejected the request (HTTP 400): ${serverMsg}. ` +
          `User streams support filter top/bullish/bearish/all only.`
      );
    }
    if (status !== 200) {
      fail("API_ERROR", `Stocktwits user stream returned HTTP ${status} for ${url}`);
    }
    if (!body || !Array.isArray(body.messages) || !body.user) {
      fail("API_ERROR", "Stocktwits user stream response missing messages/user — the API may have drifted");
    }

    if (!userProfile) {
      userProfile = mapUser(body.user, username);
      if (body.pinned_message) {
        pinnedMessage = mapMessage(body.pinned_message, username);
      }
    }

    for (const msg of body.messages) {
      posts.push(mapMessage(msg, username));
    }

    const c = body.cursor;
    const more = c && !!c.more;
    cursor = c && c.max !== undefined && c.max !== null ? c.max : null;

    if (posts.length >= limit) break;
    // 流已到底（more=false）且仍未集满 limit → partial=true。
    if (!more || cursor === null) {
      partial = true;
      break;
    }
  }

  if (posts.length > limit) posts.length = limit;

  const result = { user: userProfile, posts, partial };
  if (pinnedMessage) result.pinnedMessage = pinnedMessage;
  return result;
}
