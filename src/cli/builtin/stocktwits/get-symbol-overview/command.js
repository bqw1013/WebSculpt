// stocktwits/get-symbol-overview — one-screen intelligence snapshot for a Stocktwits symbol.
// Runtime: node. Anonymous SSR HTML fetch of https://stocktwits.com/symbol/{symbol}.
// No login, no browser — the page embeds a <script id="__NEXT_DATA__" type="application/json">
// block whose props.pageProps.initialData carries quote, sentiment, poll, fundamentals,
// earnings facts and news. Verified 2026-08-20.
//
// Key facts (verified):
//   - Crypto symbols (e.g. BTC.X) 308-redirect to /coins/{slug}; the command follows redirects
//     and the final page's initialData.symbol still equals the requested symbol (BTC.X).
//   - Live/intraday price is in price_data.combined (is_valid/price/change/percent_change);
//     there is NO extended_hours field.
//   - price_data for crypto lacks OHLC/volume/previous_close -> those map to null.
//   - Sentiment score+label lives in initialBullBearVoteData (server provides the title, e.g.
//     "Bullish Sentiment"); initialSentimentCardData has the current-vs-previous-day card.
//   - aiContent is only populated for crypto (stock symbols return []).
//   - poll is a SITE-WIDE daily rotating poll, not symbol-specific.
//   - fundamentals may be null; dailySentiment is always null (ignore).

import https from "node:https";
import zlib from "node:zlib";

const BASE = "https://stocktwits.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3; // 429/403/网络错误退避重试上限
const MAX_REDIRECTS = 5; // 加密货 308 -> /coins/{slug}，最多跟随 5 跳

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

// Convert a possibly-string/number value to a number; null when absent/blank/NaN.
function toNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
}

// snake_case -> camelCase (used for fundamentals top-level keys).
function camelize(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[camelize(k)] = v;
  return out;
}

// 礼貌限速：每次 HTTP 请求前随机 sleep 200-700ms
async function antiCrawlSleep() {
  await sleep(200 + Math.floor(Math.random() * 500));
}

// Single HTTPS GET via node:https (stable TLS profile for Cloudflare).
// Resolves {status, headers, body} for a final response, or {status, redirect} for a 3xx with Location.
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      u,
      {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "close",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve({ status: res.statusCode, redirect: new URL(res.headers.location, u).href });
        }
        const chunks = [];
        let stream = res;
        const enc = (res.headers["content-encoding"] || "").toLowerCase();
        if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })
        );
        stream.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.end();
  });
}

// Follow redirects (each hop gets its own polite pacing sleep) and return the final response.
async function fetchFollowingRedirects(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await antiCrawlSleep();
    const r = await httpGet(url);
    if (r.redirect) {
      url = r.redirect;
      continue;
    }
    return r;
  }
  fail("NETWORK_ERROR", `Too many redirects fetching ${startUrl}`);
}

// Retry wrapper: 429/403 -> RATE_LIMITED backoff, transport errors -> NETWORK_ERROR, max 3 attempts.
async function fetchWithRetry(url) {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let r;
    try {
      r = await fetchFollowingRedirects(url);
    } catch (e) {
      if (e && e.code) throw e; // 业务错误直接透传
      if (attempts >= MAX_ATTEMPTS) {
        fail("NETWORK_ERROR", `Request to ${url} failed: ${(e && e.message) || e}`);
      }
      await sleep(1000 * attempts);
      continue;
    }
    if (r.status === 429 || r.status === 403) {
      if (attempts >= MAX_ATTEMPTS) {
        fail("RATE_LIMITED", `Stocktwits rate-limited or blocked the request (HTTP ${r.status}) for ${url}`);
      }
      const ra = toNum(r.headers["retry-after"]) * 1000 || 0;
      await sleep(ra || 1000 * attempts);
      continue;
    }
    return r;
  }
}

function parseInitialData(html, requestedSymbol) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    fail(
      "API_ERROR",
      "__NEXT_DATA__ script tag not found in the symbol page — the Stocktwits page structure may have changed"
    );
  }
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    fail("API_ERROR", "__NEXT_DATA__ is not valid JSON — the page structure may have drifted");
  }
  const initialData = data && data.props && data.props.pageProps && data.props.pageProps.initialData;
  if (!initialData || typeof initialData.symbol !== "string" || !initialData.symbol) {
    fail("NOT_FOUND", `Symbol "${requestedSymbol}" not found on Stocktwits`);
  }
  return initialData;
}

export default async function (params) {
  // symbol 必填：标的代码，如 AAPL、MSTR、BTC.X（加密货自动 308 到 /coins/{slug}，命令跟随重定向）
  const symbol = String(params.symbol || "").trim().toUpperCase();
  if (!symbol) {
    fail("MISSING_PARAM", "symbol is required, e.g. AAPL, MSTR, BTC.X");
  }
  if (symbol.length > 32) {
    fail("INVALID_PARAM", "symbol is too long");
  }
  if (/[\s/?#]/.test(symbol)) {
    fail("INVALID_PARAM", "symbol contains illegal characters");
  }

  const url = `${BASE}/symbol/${encodeURIComponent(symbol)}`;
  const res = await fetchWithRetry(url);

  if (res.status === 404) {
    fail("NOT_FOUND", `Symbol "${symbol}" not found (HTTP 404) — Stocktwits has no page for it`);
  }
  if (res.status >= 400) {
    fail("API_ERROR", `Unexpected HTTP ${res.status} from ${url}`);
  }

  const initialData = parseInitialData(res.body, symbol);

  // ---- symbol metadata ----
  const meta = initialData;
  const symbolOut = {
    symbol: meta.symbol ?? null,
    symbolMic: meta.symbolMic ?? null,
    symbolDisplay: meta.symbolDisplay ?? null,
    title: meta.title ?? null,
    exchange: meta.exchange ?? null,
    region: meta.region ?? null,
    logoUrl: meta.logoUrl ?? null,
    sector: meta.sector ?? null,
    industry: meta.industry ?? null,
    instrumentClass: meta.instrumentClass ?? null,
    watchlistCount: toNum(meta.watchlistCount),
    trendingScore: toNum(meta.trendingScore),
    trendStatus: meta.trending ?? null,
  };

  // ---- price ----
  const pd = initialData.price_data || {};
  const cb = pd.combined || {};
  const price = {
    open: toNum(pd.open),
    high: toNum(pd.high),
    low: toNum(pd.low),
    last: toNum(pd.last),
    previousClose: toNum(pd.previous_close),
    change: toNum(pd.change),
    percentChange: toNum(pd.percent_change),
    volume: toNum(pd.volume),
    currencyCode: pd.currency_code ?? null,
    currencySymbol: pd.currency_symbol ?? null,
    quoteType: pd.quote_type ?? null,
    timestamp: pd.timestamp ?? null,
    combined: {
      isValid: cb.is_valid ?? null,
      price: toNum(cb.price),
      change: toNum(cb.change),
      percentChange: toNum(cb.percent_change),
      timestamp: cb.timestamp ?? null,
    },
  };

  // ---- sentiment (score + label from initialBullBearVoteData; card from initialSentimentCardData) ----
  const vote = initialData.initialBullBearVoteData || {};
  const card = initialData.initialSentimentCardData || {};
  const mapCardList = (list) =>
    Array.isArray(list)
      ? list.map((x) => ({ label: x && x.label != null ? x.label : null, value: toNum(x && x.value) }))
      : [];
  const sentiment = {
    score: toNum(vote.score),
    label: vote.title ?? null,
    card: {
      messageVol: mapCardList(card.messageVol),
      sentiment: mapCardList(card.sentiment),
    },
  };

  // ---- aiSummary (only crypto pages carry aiContent) ----
  const aiSummary = (Array.isArray(initialData.aiContent) ? initialData.aiContent : [])
    .filter((x) => x && x.data && typeof x.data.summary === "string")
    .map((x) => ({
      type: x.type ?? null,
      summary: x.data.summary,
      createdAt: x.createdAt ?? null,
    }));

  // ---- poll (site-wide daily rotating, not symbol-specific) ----
  const p = initialData.poll || {};
  const poll = {
    id: p.id ?? null,
    question: p.question ?? null,
    status: p.status ?? null,
    totalVotes: toNum(p.totalVotes),
    sponsored: p.sponsored ?? null,
    startsAt: p.startsAt ?? null,
    expiresAt: p.expiresAt ?? null,
    winningChoice: p.winningChoice ?? null,
    choices: Array.isArray(p.choices)
      ? p.choices.map((c) => ({ title: c && c.title != null ? c.title : null, percent: toNum(c && c.percent) }))
      : [],
  };

  // ---- fundamentals (null-tolerant; camelize top-level snake_case keys) ----
  const fundamentals = initialData.fundamentals ? camelizeKeys(initialData.fundamentals) : null;

  // ---- earningsFacts (source key is ePS; normalize to eps and drop the original) ----
  const ef = initialData.earningsFacts;
  const earningsFacts = ef
    ? (() => {
        const { ePS, eps, ...rest } = ef;
        return { eps: ePS ?? eps ?? null, ...rest };
      })()
    : null;

  // ---- news (articles; url only from canonical_url, hosted articles may have empty canonical_url) ----
  const news = (Array.isArray(initialData.articles) ? initialData.articles : []).map((a) => ({
    headline: a && a.headline != null ? a.headline : null,
    url: a && a.canonical_url ? a.canonical_url : null,
    summary: a && a.summary != null ? a.summary : null,
    source: a && a.source ? a.source.source_name ?? null : null,
    publishedAt: a && a.created_at != null ? a.created_at : null,
  }));

  return { symbol: symbolOut, price, sentiment, aiSummary, poll, fundamentals, earningsFacts, news };
}
