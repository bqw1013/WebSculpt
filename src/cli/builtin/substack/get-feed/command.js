// Substack get-feed: fetch personal or category feed via internal API.

const CATEGORY_SLUGS = new Set([
  "technology", "us-politics", "political-philosophy", "hobbies-interests", "us-government-policy",
  "football-(soccer)", "programming-development", "investigative-journalism", "physics-chemistry",
  "online-learning", "software-apps", "video-games", "local-news", "k-12-education", "sports",
  "health-politics", "national-news", "international", "cultural-commentary", "us-political-satire",
  "sustainable-living", "banking-credit", "marketing", "photography", "ux/ui-design", "comics", "humor",
  "travel", "business", "fiction", "literature", "faith", "world-politics", "food", "fashionandbeauty",
  "design", "music", "culture", "history", "finance", "news", "film-and-tv", "art", "climate", "parenting",
  "science", "health", "home-garden", "crypto", "philosophy", "education"
]);

const SORT_OPTIONS = new Set(["recent", "posts"]);

function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

function parseLimit(value) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    throwError("INVALID_PARAM", "limit must be a positive integer");
  }
  return Math.min(num, 100);
}

function normalizePost(item) {
  const post = item.post || {};
  const publication = item.publication || {};
  const user = (item.context && item.context.users && item.context.users[0]) || {};
  const subdomain = publication.subdomain || "substack";
  const slug = post.slug || "";
  const url = slug
    ? `https://${subdomain}.substack.com/p/${slug}`
    : (post.canonical_url || "");

  return {
    type: "post",
    title: post.title || "",
    author: user.name || publication.primary_profile_name || "",
    author_handle: user.handle || "",
    author_url: user.handle ? `https://substack.com/@${user.handle}` : "",
    publication_name: publication.name || "",
    publication_url: subdomain ? `https://${subdomain}.substack.com/` : "",
    url,
    published_at: post.post_date || "",
    snippet: post.subtitle || post.truncated_body_text || "",
    like_count: post.reactions ? Object.values(post.reactions).reduce((a, b) => a + (b || 0), 0) : 0,
    comment_count: post.comment_count || 0,
    restack_count: post.restacks || 0
  };
}

function normalizeNote(item) {
  const comment = item.comment || {};
  const user = (item.context && item.context.users && item.context.users[0]) || {};
  const handle = user.handle || comment.handle || "";
  const entityKey = item.entity_key || "";

  let snippet = "";
  if (comment.body) {
    snippet = comment.body;
  } else if (comment.comment) {
    snippet = comment.comment;
  } else if (item.context && item.context.title) {
    snippet = item.context.title;
  }

  // reactions is an object like {"❤": 14} or null
  let likeCount = 0;
  if (comment.reactions && typeof comment.reactions === "object") {
    likeCount = Object.values(comment.reactions).reduce((a, b) => a + (b || 0), 0);
  }

  return {
    type: "note",
    title: "",
    author: user.name || comment.name || "",
    author_handle: handle,
    author_url: handle ? `https://substack.com/@${handle}` : "",
    publication_name: "",
    publication_url: "",
    url: entityKey && handle ? `https://substack.com/@${handle}/note/${entityKey}` : "",
    published_at: (item.context && item.context.timestamp) || comment.date || "",
    snippet,
    like_count: likeCount,
    comment_count: comment.comment_count || 0,
    restack_count: comment.restack_count || 0
  };
}

function normalizeItem(item) {
  if (!item || !item.type) return null;

  if (item.type === "post") {
    return normalizePost(item);
  }

  if (item.type === "comment") {
    return normalizeNote(item);
  }

  // Skip leaderboard and userSuggestions by default
  return null;
}

export default async (page, params, cwd) => {
  const category = params.category || "";
  const sort = params.sort || "recent";
  const limit = parseLimit(params.limit || "20");

  if (category && !CATEGORY_SLUGS.has(category)) {
    throwError("INVALID_PARAM", `Unknown category slug: ${category}. Use one of the documented slugs.`);
  }

  if (!SORT_OPTIONS.has(sort)) {
    throwError("INVALID_PARAM", `sort must be "recent" or "posts"`);
  }

  // Navigate to a Substack page so in-page fetch includes cookies.
  await page.goto("https://substack.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

  const results = await page.evaluate(async (args) => {
    const { category, sort, limit } = args;
    const items = [];
    let cursor = null;
    let pages = 0;
    const maxPages = 20;

    const baseUrl = category
      ? `https://substack.com/api/v1/search/explore/web?tab=${encodeURIComponent(category)}&type=category&sort=${encodeURIComponent(sort)}`
      : "https://substack.com/api/v1/reader/feed?tab=for-you&type=base";

    while (items.length < limit && pages < maxPages) {
      const url = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl;
      let res;
      try {
        res = await fetch(url, { credentials: "include" });
      } catch (e) {
        return { error: "FETCH_FAILED", message: e.message, url };
      }

      if (res.status === 401 || res.status === 403) {
        return { error: "AUTH_REQUIRED", status: res.status, url };
      }

      if (!res.ok) {
        return { error: "API_ERROR", status: res.status, url };
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        return { error: "JSON_PARSE_FAILED", message: e.message, url };
      }

      if (!data || !Array.isArray(data.items)) {
        return { error: "DRIFT_DETECTED", message: "Response missing items array", url };
      }

      for (const item of data.items) {
        if (items.length >= limit) break;
        items.push(item);
      }

      cursor = data.nextCursor;
      pages += 1;

      if (!cursor || data.items.length === 0) {
        break;
      }
    }

    return { items, cursor, pages };
  }, { category, sort, limit });

  if (results.error) {
    if (results.error === "AUTH_REQUIRED") {
      throwError("AUTH_REQUIRED", "Substack login required for personal feed.");
    }
    if (results.error === "DRIFT_DETECTED") {
      throwError("DRIFT_DETECTED", results.message || "Feed API structure changed.");
    }
    throwError(results.error, results.message || `API request failed: ${results.url}`);
  }

  const normalized = [];
  for (const item of results.items) {
    const norm = normalizeItem(item);
    if (norm) {
      normalized.push(norm);
    }
  }

  if (normalized.length === 0) {
    throwError("EMPTY_RESULT", "No feed items found.");
  }

  return {
    count: normalized.length,
    pages_fetched: results.pages,
    items: normalized
  };
};
