// stocktwits/list-rankings
// Fetches one of the seven symbol ranking lists behind stocktwits.com/sentiment (the /sentiment chart center).
// Anonymous public JSON API — no login, no browser, no cookies. Chrome user-agent. Random polite pacing sleep + backoff.
//
// type 七值枚举（一一对应 /sentiment 的七个 tab 与端点文件，数组键各不相同，必须按 type 取）:
//   trending      热议 — most-discussed symbols (Stocktwits trending score), endpoint symbols_enhanced.json, key "symbols"
//   most-active   最活跃 — highest message volume, endpoint most_active.json, key "most_active"
//   watchers      最多关注 — most-watched symbols, endpoint top_watched.json, key "top_watched"
//   most-bullish  最看多 — highest share of Bullish-tagged posts, endpoint most_bullish.json, key "most_bullish"
//   most-bearish  最看空 — highest share of Bearish-tagged posts, endpoint most_bearish.json, key "most_bearish"
//   top-gainers   涨幅榜 — biggest price gainers, endpoint top_gainers.json, key "top_gainers"
//   top-losers    跌幅榜 — biggest price losers, endpoint top_losers.json, key "top_losers"
//
// class 三值枚举（stocks/etfs 被 API 静默忽略，必须拒绝）:
//   all          全部 — all instrument types
//   equities     股票+ETF — stocks and ETFs only (region=US, NASDAQ/NYSE/NYSEArca)
//   crypto       加密货币 — crypto pairs only (region=X, exchange=CRYPTO, symbols like BTC.X)

const TYPES = {
  trending: { file: "symbols_enhanced.json", key: "symbols" },
  "most-active": { file: "most_active.json", key: "most_active" },
  watchers: { file: "top_watched.json", key: "top_watched" },
  "most-bullish": { file: "most_bullish.json", key: "most_bullish" },
  "most-bearish": { file: "most_bearish.json", key: "most_bearish" },
  "top-gainers": { file: "top_gainers.json", key: "top_gainers" },
  "top-losers": { file: "top_losers.json", key: "top_losers" },
};

const CLASS_VALUES = ["all", "equities", "crypto"]; // all 全部 / equities 股票+ETF / crypto 加密货币

const BASE_URL = "https://api.stocktwits.com/api/2/trending/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_PAGES = 50; // pagination guard; the API soft-ends around 7 pages at 100/page (~630-660 items)
const MAX_LIMIT = 1000; // hard cap to prevent runaway pagination

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

// Random polite pacing delay (200-700ms) before each HTTP request.
function politeDelay() {
  const ms = 200 + Math.floor(Math.random() * 501); // 200..700
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch a URL as JSON with backoff retry for 429/403/5xx/network errors (max 3 attempts).
async function fetchJsonWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) await sleep(400 * attempt); // backoff between attempts
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.status === 429 || res.status === 403) {
        lastError = makeError("RATE_LIMITED", `Rate limited by Stocktwits API (HTTP ${res.status})`);
        continue; // retry
      }
      if (res.status === 404) {
        throw makeError("NOT_FOUND", "Ranking endpoint not found (HTTP 404)");
      }
      if (res.status >= 500) {
        lastError = makeError("API_ERROR", `Stocktwits API server error (HTTP ${res.status})`);
        continue; // retry
      }
      if (!res.ok) {
        throw makeError("API_ERROR", `Stocktwits API error (HTTP ${res.status})`);
      }
      return await res.json();
    } catch (err) {
      // fetch threw (connection dropped / DNS / timeout): retryable network error.
      if (!err || !err.code) {
        lastError = makeError("NETWORK_ERROR", `Connection failed: ${err && err.message}`);
        continue;
      }
      throw err; // business error (NOT_FOUND etc.) — do not retry
    }
  }
  throw lastError;
}

// Map a raw API symbol object to the command's output entry shape.
function mapEntry(it) {
  const price = it.price_data && typeof it.price_data === "object" ? it.price_data : null;
  const fund = it.fundamentals && typeof it.fundamentals === "object" ? it.fundamentals : null;
  const entry = {
    rank: it.rank,
    symbol: it.symbol,
    title: it.title,
    exchange: it.exchange,
    region: it.region,
    sector: it.sector,
    industry: it.industry,
    watchlistCount: it.watchlist_count,
    instrumentClass: it.instrument_class,
    trendingScore: it.trending_score,
    trendsSummary: it.trends && it.trends.summary ? it.trends.summary : null,
    logoUrl: it.logo_url,
  };
  if (price) {
    entry.price = {
      last: price.last,
      change: price.change,
      percentChange: price.percent_change,
      open: price.open,
      high: price.high,
      low: price.low,
      volume: price.volume,
      previousClose: price.previous_close,
    };
  }
  if (fund) {
    entry.fundamentals = {
      name: fund.name,
      businessDescription: fund.business_description,
      industryName: fund.industry_name,
      sectorName: fund.sector_name,
    };
  }
  return entry;
}

export default async function (params) {
  const type = params.type;
  const klass = params.class;
  const region = params.region;
  const limitRaw = params.limit;

  // --- type: 七值枚举校验 ---
  const typeDef = TYPES[type];
  if (!typeDef) {
    throw makeError(
      "INVALID_PARAM",
      `Invalid type "${type}". Valid values: ${Object.keys(TYPES).join(", ")} ` +
        "(trending 热议 / most-active 最活跃 / watchers 最多关注 / most-bullish 最看多 / most-bearish 最看空 / top-gainers 涨幅榜 / top-losers 跌幅榜)",
    );
  }

  // --- class: 三值枚举校验（stocks/etfs 被 API 静默忽略 → 拒绝） ---
  if (!CLASS_VALUES.includes(klass)) {
    throw makeError(
      "INVALID_PARAM",
      `Invalid class "${klass}". Valid values: ${CLASS_VALUES.join(", ")} (all 全部 / equities 股票+ETF / crypto 加密货币). stocks/etfs are not accepted by the API.`,
    );
  }

  // --- limit: 先对原始字符串做正则校验再 parseInt，防截断 ---
  if (!/^\d+$/.test(limitRaw)) {
    throw makeError("INVALID_PARAM", `Invalid limit "${limitRaw}". Must be a positive integer.`);
  }
  const limit = parseInt(limitRaw, 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw makeError("INVALID_PARAM", `Invalid limit ${limit}. Must be between 1 and ${MAX_LIMIT}.`);
  }

  // API 单页上限 100；页大小按请求条数自适应。
  const pageSize = Math.min(limit, 100);

  // 构建请求 URL。payloads=qprices&enable_price_v2=true 才会返回 price_data。
  // region 在 API 上是 no-op（非 US 值不报错、不返回空、不过滤），按页面惯例透传为 regions（复数）。
  const buildUrl = (pageNum) => {
    const qs = [
      `class=${encodeURIComponent(klass)}`,
      `limit=${pageSize}`,
      `page_num=${pageNum}`,
      "payloads=qprices",
      "enable_price_v2=true",
      `regions=${encodeURIComponent(region)}`,
    ].join("&");
    return `${BASE_URL}${typeDef.file}?${qs}`;
  };

  const entries = [];
  let pageNum = 1;
  let guard = 0;
  let moreAvailable = false;

  while (entries.length < limit && guard < MAX_PAGES) {
    guard += 1;
    await politeDelay(); // 每次 HTTP 请求前随机 sleep 200-700ms（礼貌限速）
    const data = await fetchJsonWithRetry(buildUrl(pageNum));
    if (!data || typeof data !== "object" || !Array.isArray(data[typeDef.key])) {
      throw makeError(
        "API_ERROR",
        `Unexpected response shape from Stocktwits API (missing "${typeDef.key}" array). The endpoint may have changed.`,
      );
    }
    const list = data[typeDef.key];
    moreAvailable = !!(data.cursor && data.cursor.more === true);
    for (const it of list) {
      if (entries.length >= limit) break;
      entries.push(mapEntry(it));
    }
    pageNum += 1;
    if (list.length === 0 || !moreAvailable) break; // count==0 || !more 判耗尽（深翻页软结束，不报错）
  }

  // partial 语义（与库惯例一致）：仅当流耗尽/返回不足 limit 时为 true；达 limit 正常截断时为 false。
  const exhaustedEarly = entries.length < limit;
  const hitGuard = guard >= MAX_PAGES;
  const partial = exhaustedEarly || hitGuard;

  return { type, entries, partial };
}
