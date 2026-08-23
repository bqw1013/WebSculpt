// techcrunch/search — keyword search over TechCrunch articles via the public
// WordPress REST API (ElasticPress-backed). Returns article cards newest-first
// (reverse-chronological, same corpus as the on-site search box), paginating
// internally up to the requested limit. No auth, no browser required.
//
// Verified 2026-08-14 (trace + curl + browser):
//   - GET /wp-json/wp/v2/posts?search={q} is public, returns JSON.
//   - X-WP-Total / X-WP-TotalPages headers carry match totals.
//   - per_page cap 100; page=1 and page=2 at per_page=100 have zero ID overlap
//     (deep pagination is real, not duplicated).
//   - No-match query -> HTTP 200 + empty array.
//   - Category IDs are resolved to names via a single batch
//     GET /wp-json/wp/v2/categories?include=...
//   - On-site UI (?s=) ranks by relevance; the API returns newest-first.

const API_BASE = "https://techcrunch.com/wp-json/wp/v2";
const CARD_FIELDS = "id,date,link,title,excerpt,jetpack_featured_media_url,categories";
const CAT_FIELDS = "id,name,slug";
const MAX_LIMIT = 100;
const PAGE_SIZE = 100;

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

// Polite pacing: random 200-700ms before each node request (access-politeness policy).
function randomDelayMs() {
  return 200 + Math.floor(Math.random() * 500);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  if (html == null) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    commandError("NETWORK_ERROR", `request failed: ${error.message}`);
  }
  if (response.status === 429 || response.status === 403) {
    commandError("RATE_LIMITED", `TechCrunch API blocked the request (HTTP ${response.status})`);
  }
  if (!response.ok) {
    commandError("API_ERROR", `TechCrunch API returned HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("x-wp-total") || 0);
  let data;
  try {
    data = await response.json();
  } catch (error) {
    commandError("PARSE_ERROR", `failed to parse API response as JSON: ${error.message}`);
  }
  return { data, total };
}

export default async function (params) {
  const query = params.query == null ? "" : String(params.query).trim();
  if (query === "") {
    commandError("MISSING_PARAM", "query is required (search keywords, e.g. \"openai\")");
  }

  const limitText = params.limit == null ? "" : String(params.limit).trim();
  if (!/^\d+$/.test(limitText)) {
    commandError("INVALID_PARAM", "limit must be a positive integer (1-100)");
  }
  const limit = Number(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    commandError("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}`);
  }

  const articles = [];
  const categoryIds = new Set();
  let page = 1;
  let totalResults = 0;

  while (articles.length < limit && page <= 40) {
    const url = `${API_BASE}/posts?search=${encodeURIComponent(query)}&per_page=${PAGE_SIZE}&page=${page}&_fields=${CARD_FIELDS}`;
    await sleep(randomDelayMs());
    const { data, total } = await fetchJson(url);
    if (!Array.isArray(data)) {
      commandError("DRIFT_DETECTED", "posts API response is not an array");
    }
    if (page === 1) totalResults = total;
    if (data.length === 0) break;

    for (const post of data) {
      if (articles.length >= limit) break;
      articles.push(post);
      for (const cid of post.categories || []) categoryIds.add(cid);
    }
    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  // Resolve category names in one batch request.
  const categoryNames = new Map();
  if (categoryIds.size > 0) {
    const include = [...categoryIds].join(",");
    const url = `${API_BASE}/categories?include=${include}&per_page=50&_fields=${CAT_FIELDS}`;
    await sleep(randomDelayMs());
    const { data } = await fetchJson(url);
    if (Array.isArray(data)) {
      for (const cat of data) {
        if (cat && cat.id != null && cat.name != null) categoryNames.set(cat.id, cat.name);
      }
    }
  }

  const cards = articles.map((post) => ({
    title: stripHtml(post.title && post.title.rendered),
    url: post.link || "",
    date: post.date || "",
    excerpt: stripHtml(post.excerpt && post.excerpt.rendered),
    image: post.jetpack_featured_media_url || null,
    categories: (post.categories || [])
      .map((id) => categoryNames.get(id))
      .filter((name) => name != null),
  }));

  return {
    query,
    count: cards.length,
    total: totalResults,
    partial: cards.length < limit,
    articles: cards,
  };
}
