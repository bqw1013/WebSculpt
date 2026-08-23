const API_BASE = "https://techcrunch.com/wp-json/wp/v2";
const POST_FIELDS = "id,date,link,title,excerpt,jetpack_featured_media_url,categories";
const PER_PAGE = 100;

function decodeEntities(str) {
  return (str || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8230;/g, "…")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

function stripHtml(html) {
  return decodeEntities((html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function randDelayMs() {
  // Random 200–700ms before each request (polite pacing).
  return Math.floor(Math.random() * 500) + 200;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(url) {
  await sleep(randDelayMs());

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (err) {
    const error = new Error(`[NETWORK_ERROR] Failed to fetch TechCrunch API: ${err.message}`);
    error.code = "NETWORK_ERROR";
    throw error;
  }

  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error("[RATE_LIMITED] TechCrunch API rate limit exceeded. Please retry later.");
      err.code = "RATE_LIMITED";
      throw err;
    }
    const err = new Error(`[API_ERROR] TechCrunch API returned ${response.status} ${response.statusText}`);
    err.code = "API_ERROR";
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const error = new Error(`[PARSE_ERROR] Failed to parse API response: ${err.message}`);
    error.code = "PARSE_ERROR";
    throw error;
  }

  return {
    data,
    total: parseInt(response.headers.get("x-wp-total") || "0", 10),
  };
}

function assertArray(value) {
  if (!Array.isArray(value)) {
    const err = new Error("[DRIFT_DETECTED] Unexpected API response format, expected an array");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
}

// Helper functions can be defined above export default
export default async function(params) {

  const topic = params.topic;
  if (typeof topic !== "string" || topic.trim() === "") {
    const err = new Error("[MISSING_PARAM] --topic is required (tag slug, e.g. apple)");
    err.code = "MISSING_PARAM";
    throw err;
  }
  if (/\s/.test(topic)) {
    const err = new Error("[INVALID_PARAM] topic must be a tag slug without spaces (e.g. apple, cloud-computing)");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const rawLimit = params.limit;
  if (typeof rawLimit !== "string" || !/^[1-9]\d*$/.test(rawLimit)) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(rawLimit, 10);
  if (limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // 1. Resolve tag slug -> numeric ID (also yields display name and total article count).
  const tagUrl = new URL(`${API_BASE}/tags`);
  tagUrl.searchParams.set("slug", topic);
  tagUrl.searchParams.set("_fields", "id,name,slug,count");
  const { data: tags } = await apiGet(tagUrl.toString());
  assertArray(tags);

  if (tags.length === 0) {
    const err = new Error(`[NOT_FOUND] Tag "${topic}" not found. Use a tag slug from a TechCrunch tag page (techcrunch.com/tag/{slug}/), e.g. apple, openai, cloud-computing.`);
    err.code = "NOT_FOUND";
    throw err;
  }
  const tag = tags[0];

  // 2. Fetch posts under the tag, paginating internally until limit or stream exhaustion.
  const posts = [];
  for (let page = 1; page <= 10; page++) {
    const postsUrl = new URL(`${API_BASE}/posts`);
    postsUrl.searchParams.set("tags", String(tag.id));
    postsUrl.searchParams.set("per_page", String(PER_PAGE));
    postsUrl.searchParams.set("page", String(page));
    postsUrl.searchParams.set("_fields", POST_FIELDS);
    const { data: pagePosts } = await apiGet(postsUrl.toString());
    assertArray(pagePosts);

    posts.push(...pagePosts);
    if (posts.length >= limit) break;
    if (pagePosts.length < PER_PAGE) break; // stream exhausted
  }

  // 3. Resolve numeric category ids to display names (single bounded batch request).
  const catIds = [];
  for (const post of posts) {
    if (Array.isArray(post.categories)) {
      for (const id of post.categories) {
        if (!catIds.includes(id)) catIds.push(id);
      }
    }
  }
  const catNameMap = {};
  if (catIds.length > 0) {
    const catUrl = new URL(`${API_BASE}/categories`);
    catUrl.searchParams.set("include", catIds.join(","));
    catUrl.searchParams.set("per_page", "50");
    catUrl.searchParams.set("_fields", "id,name,slug");
    const { data: cats } = await apiGet(catUrl.toString());
    if (Array.isArray(cats)) {
      for (const c of cats) catNameMap[c.id] = c.name;
    }
  }

  // 4. Build output.
  const articles = posts.slice(0, limit).map((post) => ({
    title: stripHtml(post.title?.rendered),
    url: post.link || "",
    date: post.date || "",
    excerpt: stripHtml(post.excerpt?.rendered),
    image: post.jetpack_featured_media_url || "",
    categories: Array.isArray(post.categories)
      ? post.categories.map((id) => catNameMap[id]).filter(Boolean)
      : [],
  }));

  const result = {
    topic: { slug: tag.slug, name: tag.name, articleCount: tag.count },
    articles,
  };
  if (posts.length < limit) {
    result.partial = true;
  }
  return result;
}
