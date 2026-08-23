// stocktwits/list-news — Stocktwits editorial market news feed.
//
// Primary path: the site's own load-more JSON API
//   GET https://stocktwits.com/api/tabArticles?tab={tab}&limit={limit}&lastArticleSid={sid}
//   -> {"articles":[...],"status":"success"}
// Verified in explore (2026-08-20):
// anonymous, Chrome UA only (no Referer/Accept needed), effectively unrate-limited
// (58-request burst all 200), limit<=50, lastArticleSid cursor pagination, and the
// articles are field-for-field identical to the /news-articles SSR __NEXT_DATA__.
//
// Tab shape differences (platform truth, not degradation):
//   stocktwits (default) -> ARRAY with full HTML content (3-6KB per article)
//   crypto              -> ARRAY, summary-only (content is an empty string)
//   trending / stocks   -> OBJECT grouped by symbol {symbol:[articles]}, summary-only
//                          (content is an empty string)
//   watchlist           -> empty array when anonymous (needs login)
// The command returns the native structure per tab and documents it in the README.

const API_BASE = 'https://stocktwits.com/api/tabArticles';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_TAB = 'stocktwits';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_RETRIES = 3;

// Valid tabs; value notes the response shape each returns.
const TABS = {
  stocktwits: '编辑团队默认 tab：articles 为数组，每篇带全文 content（HTML 3-6KB）',
  trending: '按 symbol 分组的对象 {symbol: [articles]}，每篇仅 summary（无 content）',
  stocks: '按 symbol 分组的对象 {symbol: [articles]}，每篇仅 summary（无 content）',
  crypto: '数组，每篇仅 summary（无 content），平台真实行为',
  watchlist: '匿名返回空数组，需登录',
};

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

// Fetch the tabArticles JSON with polite pacing (random 200-700ms sleep before
// EVERY request) and backoff retry on 429/403/network errors (up to MAX_RETRIES).
async function fetchJson(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(randomBetween(200, 700));

    let resp;
    try {
      resp = await fetch(url, {
        headers: { 'user-agent': UA },
        redirect: 'follow',
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(randomBetween(500, 1000) * attempt);
        continue;
      }
      fail('NETWORK_ERROR', `Failed to fetch ${url}: ${err.message}`);
    }

    if (resp.status === 429 || resp.status === 403) {
      if (attempt < MAX_RETRIES) {
        await sleep(randomBetween(500, 1000) * attempt);
        continue;
      }
      fail('RATE_LIMITED', `Stocktwits rate-limited or blocked the request (HTTP ${resp.status}) after ${MAX_RETRIES} attempts`);
    }

    if (!resp.ok) {
      fail('API_ERROR', `Unexpected HTTP ${resp.status} from ${url}`);
    }

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      fail('NETWORK_ERROR', `Non-JSON response from ${url}`);
    }
  }
  fail('NETWORK_ERROR', `Unreachable — request loop exited without a result for ${url}`);
}

// Normalize one article's snake_case API fields to the camelCase output schema.
function normalizeArticle(a) {
  if (!a || typeof a !== 'object') return a;
  return {
    sid: a.sid ?? null,
    headline: a.headline ?? null,
    summary: a.summary ?? null,
    content: a.content ?? null, // full HTML body; empty string on crypto/trending/stocks tabs
    createdAt: a.created_at ?? null,
    updatedAt: a.updated_at ?? null,
    urlSlug: a.url_slug ?? null,
    canonicalUrl: a.canonical_url ?? null,
    category: a.category ?? null, // {id, name}
    subcategory: a.subcategory ?? null, // {id, name, parent_id}
    primarySymbolCode: a.primary_symbol_code ?? null,
    symbolCodes: a.symbol_codes ?? null,
    symbolsMetadata: a.symbols_metadata ?? null, // {symbol: {logo_url, deeplink, ...}}
    tags: a.tags ?? null, // [{id, tag_name}]
    source: a.source ?? null, // {id, source_name, url_domain}
    featuredImage: a.featured_image ?? null,
    author: a.author ?? null, // {id, name, designation, description, profile_avatar, social_media_links}
  };
}

// Keep the native per-tab shape: array for stocktwits/crypto, symbol-grouped
// object for trending/stocks. Only the article field names are normalized.
function normalizeArticles(articles) {
  if (Array.isArray(articles)) return articles.map(normalizeArticle);
  if (articles && typeof articles === 'object') {
    const out = {};
    for (const key of Object.keys(articles)) {
      out[key] = Array.isArray(articles[key]) ? articles[key].map(normalizeArticle) : articles[key];
    }
    return out;
  }
  return articles;
}

// Total article count across array or symbol-grouped-object shapes (for partial).
function articleCount(articles) {
  if (Array.isArray(articles)) return articles.length;
  if (articles && typeof articles === 'object') {
    let n = 0;
    for (const key of Object.keys(articles)) {
      n += Array.isArray(articles[key]) ? articles[key].length : 1;
    }
    return n;
  }
  return 0;
}

export default async function(params) {
  // ---- tab (enum, default stocktwits) ----
  const rawTab = params.tab == null ? '' : String(params.tab).trim().toLowerCase();
  const tab = rawTab === '' ? DEFAULT_TAB : rawTab;
  if (!Object.prototype.hasOwnProperty.call(TABS, tab)) {
    fail(
      'INVALID_PARAM',
      `unknown tab "${rawTab}" — valid tabs: ${Object.keys(TABS).join(', ')} ` +
        `(stocktwits=编辑团队默认带全文 / trending=按symbol分组摘要 / stocks=按symbol分组摘要 / crypto=摘要only / watchlist=需登录)`
    );
  }

  // ---- limit (integer 1-50, default 10; validated on the raw string) ----
  const rawLimit = params.limit == null ? '' : String(params.limit).trim();
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit)) {
      fail('INVALID_PARAM', `limit must be an integer between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      fail('INVALID_PARAM', `limit must be between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
  }

  // ---- after_sid (optional pagination cursor = previous page's last sid) ----
  const afterSid = params.after_sid == null ? '' : String(params.after_sid).trim();

  // ---- build URL ----
  let url = `${API_BASE}?tab=${encodeURIComponent(tab)}&limit=${limit}`;
  if (afterSid !== '') {
    url += `&lastArticleSid=${encodeURIComponent(afterSid)}`;
  }

  // ---- fetch + normalize ----
  const data = await fetchJson(url);
  if (!data || data.status !== 'success' || data.articles == null) {
    fail('API_ERROR', 'Unexpected response shape from tabArticles — expected {articles, status:"success"}');
  }

  const articles = normalizeArticles(data.articles);
  const count = articleCount(data.articles);
  const partial = count < limit;

  return {
    tab,
    status: 'success',
    articles,
    partial,
  };
}
