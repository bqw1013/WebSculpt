// techcrunch/get-feed: Fetch TechCrunch's chronological article stream (the feed behind
// /latest/ and every /category/{slug}/ page) via the public WordPress REST API.
// Optionally filter by one of 23 editorial categories. Paginates internally (per_page=100)
// until `limit` is reached or the stream is exhausted (partial=true).
// A small randomized delay is applied before each request to stay unobtrusive (polite pacing).
// No login required; the API is fully public.

// Category slug -> WordPress category ID mapping (verified 2026-08-14 against
// https://techcrunch.com/wp-json/wp/v2/categories; 23 editorial categories,
// excluding the `ben-test-2` test residue and the `tc` meta category).
const CATEGORY_MAP = {
  "artificial-intelligence": 577047203,
  startups: 20429,
  venture: 577030455,
  security: 21587494,
  apps: 577051039,
  climate: 576957003,
  "biotech-health": 577030454,
  commerce: 577052802,
  cryptocurrency: 576601119,
  enterprise: 449557044,
  fintech: 577030453,
  fundraising: 577234943,
  gadgets: 577052803,
  gaming: 577052804,
  "government-policy": 577065682,
  hardware: 449223024,
  "media-entertainment": 577030456,
  privacy: 426637499,
  "real-estate": 577303513,
  robotics: 577123751,
  social: 577055593,
  space: 174,
  transportation: 2401,
};

// Reverse map: WordPress category ID -> editorial slug (used to render post.categories
// as slugs; unknown/non-editorial IDs such as the `tc` meta category are dropped).
const ID_TO_SLUG = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([slug, id]) => [String(id), slug])
);

// Fields to request from the WP API (minimize response size; `categories` is needed to
// render the editorial slug list per post).
const FIELDS = "id,date,link,title,excerpt,jetpack_featured_media_url,categories";

// Randomized pre-request delay bounds (ms).
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Decode numeric HTML entities generically (curly quotes, ellipsis, dashes, etc.).
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .trim();
}

export default async function (params) {
  const category = params.category || "";
  const rawLimit = params.limit;

  // Validate limit: must be an integer string in 1-100 (default 20 injected by manifest).
  if (!/^\d+$/.test(rawLimit)) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Resolve category slug to ID.
  let categoryId = null;
  if (category) {
    categoryId = CATEGORY_MAP[category];
    if (!categoryId) {
      const known = Object.keys(CATEGORY_MAP).join(", ");
      const err = new Error(`[INVALID_CATEGORY] Unknown category "${category}". Known categories: ${known}`);
      err.code = "INVALID_CATEGORY";
      throw err;
    }
  }

  // Paginate internally (per_page=100) until `limit` reached or stream exhausted.
  const collected = [];
  let page = 1;
  let partial = false;

  while (collected.length < limit) {
    const want = Math.min(100, limit - collected.length);

    const apiUrl = new URL("https://techcrunch.com/wp-json/wp/v2/posts");
    apiUrl.searchParams.set("per_page", String(want));
    apiUrl.searchParams.set("page", String(page));
    apiUrl.searchParams.set("_fields", FIELDS);
    if (categoryId) {
      apiUrl.searchParams.set("categories", String(categoryId));
    }

    // Polite pacing: randomized delay before each request.
    await sleep(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));

    let response;
    try {
      response = await fetch(apiUrl.toString());
    } catch (err) {
      const error = new Error(`[NETWORK_ERROR] Failed to fetch TechCrunch API: ${err.message}`);
      error.code = "NETWORK_ERROR";
      throw error;
    }

    // HTTP 400 on a page beyond the last one = stream exhausted, not an error.
    if (response.status === 400) {
      partial = true;
      break;
    }
    if (!response.ok) {
      const err = new Error(`[API_ERROR] TechCrunch API returned ${response.status} ${response.statusText}`);
      err.code = "API_ERROR";
      throw err;
    }

    let posts;
    try {
      posts = await response.json();
    } catch (err) {
      const error = new Error(`[PARSE_ERROR] Failed to parse API response: ${err.message}`);
      error.code = "PARSE_ERROR";
      throw error;
    }

    if (!Array.isArray(posts)) {
      const err = new Error("[DRIFT_DETECTED] Unexpected API response format, expected an array");
      err.code = "DRIFT_DETECTED";
      throw err;
    }

    if (posts.length === 0) {
      partial = true;
      break;
    }

    collected.push(...posts);

    // A page returning fewer items than requested means the stream is exhausted.
    if (posts.length < want) {
      partial = true;
      break;
    }

    page += 1;
  }

  // Slice to limit and transform to clean output.
  const articles = collected.slice(0, limit).map((post) => ({
    id: post.id,
    title: stripHtml(post.title?.rendered || ""),
    url: post.link || "",
    date: post.date || "",
    excerpt: stripHtml(post.excerpt?.rendered || ""),
    image: post.jetpack_featured_media_url || "",
    categories: (post.categories || [])
      .map((id) => ID_TO_SLUG[String(id)])
      .filter(Boolean),
  }));

  return {
    articles,
    count: articles.length,
    partial,
    category: category || null,
  };
}
