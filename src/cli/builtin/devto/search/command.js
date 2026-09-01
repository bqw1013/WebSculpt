function throwInvalidParam(message) {
  const err = new Error(`[INVALID_PARAM] ${message}`);
  err.code = "INVALID_PARAM";
  throw err;
}

function throwEmptyResult(message) {
  const err = new Error(`[EMPTY_RESULT] ${message}`);
  err.code = "EMPTY_RESULT";
  throw err;
}

function throwNetworkError(message) {
  const err = new Error(`[NETWORK_ERROR] ${message}`);
  err.code = "NETWORK_ERROR";
  throw err;
}

function omitNullish(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj.map(omitNullish).filter((v) => v !== undefined);
  }
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = omitNullish(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }
  return obj;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1 || num > 1000 || !Number.isInteger(num)) {
    throwInvalidParam("limit must be an integer between 1 and 1000");
  }
  return num;
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseRelativeDate(text) {
  if (!text) return { iso: undefined, text };
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  let normalized = text.trim();

  // Convert "Aug 2 '19" → "Aug 2 2019"
  normalized = normalized.replace(/'(\d{2})$/, (match, yy) => {
    const year = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
    return year;
  });

  // Convert "Aug 26" → "Aug 26 2026" (assume current year)
  if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(normalized)) {
    normalized = `${normalized} ${currentYear}`;
  }

  // Parse "Aug 26 2026" as UTC to avoid timezone skew.
  const match = normalized.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!match) {
    return { iso: undefined, text };
  }
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) {
    return { iso: undefined, text };
  }
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  return { iso, text };
}

async function searchViaApi(query, limit) {
  const perPage = Math.min(limit, 1000);
  const url = `https://dev.to/api/articles/search?q=${encodeURIComponent(query)}&per_page=${perPage}`;

  let response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);
  } catch (cause) {
    throwNetworkError(`API request failed: ${cause.message}`);
  }

  if (!response.ok) {
    // The API returns 500 for many unmatched queries, so we treat non-2xx as a fallback trigger.
    throwNetworkError(`API returned ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (cause) {
    throwNetworkError(`Failed to parse API response: ${cause.message}`);
  }

  if (!Array.isArray(data)) {
    throwNetworkError("API response is not an array");
  }

  const articles = data.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    url: item.url,
    path: item.path,
    slug: item.slug,
    tags: item.tag_list || [],
    published_at: item.published_at,
    created_at: item.created_at,
    comments_count: item.comments_count,
    public_reactions_count: item.public_reactions_count,
    positive_reactions_count: item.positive_reactions_count,
    reading_time_minutes: item.reading_time_minutes,
    cover_image: item.cover_image,
    user: {
      name: item.user?.name,
      username: item.user?.username,
      github_username: item.user?.github_username,
      twitter_username: item.user?.twitter_username,
      profile_image: item.user?.profile_image,
      website_url: item.user?.website_url,
    },
  }));

  return { articles, source: "api" };
}

async function searchViaBrowser(page, query, sort, limit) {
  let url = `https://dev.to/search?q=${encodeURIComponent(query)}`;
  if (sort === "newest") {
    url += "&sort_by=published_at&sort_direction=desc";
  } else if (sort === "oldest") {
    url += "&sort_by=published_at&sort_direction=asc";
  }

  try {
    await page.goto(url, { waitUntil: "commit", timeout: 15000 });
  } catch (cause) {
    throwNetworkError(`Browser navigation failed: ${cause.message}`);
  }

  // Wait for result cards to appear. They render asynchronously; empty queries never render cards.
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("article.crayons-story").length > 0,
      { timeout: 8000 }
    );
  } catch (cause) {
    const count = await page.evaluate(() => document.querySelectorAll("article.crayons-story").length);
    if (count === 0) {
      throwEmptyResult(`No articles found for query "${query}"`);
    }
    // Cards appeared after the timeout window; continue with what is available.
  }

  const result = await page.evaluate((maxCount) => {
    const cards = Array.from(document.querySelectorAll("article.crayons-story")).slice(0, maxCount);
    const articles = cards.map((card) => {
      const titleEl = card.querySelector("h3 a");
      const authorEl = card.querySelector("a.crayons-story__secondary") || card.querySelector("a[href^='/'].fw-medium");
      const timeEl = card.querySelector("time");
      const allLinks = Array.from(card.querySelectorAll("a"));
      const commentsLink = allLinks.find((a) => a.href.includes("#comments"));
      const readingMatch = card.textContent.match(/(\d+)\s*min read/);
      const tags = Array.from(card.querySelectorAll("a.crayons-tag")).map((t) =>
        t.textContent.trim().replace(/^#/, "")
      );

      const authorName = authorEl?.textContent?.trim();
      const authorHref = authorEl?.getAttribute("href")?.replace(/^\//, "") || "";
      const authorUsername = authorHref.split("/")[0];

      return {
        title: titleEl?.textContent?.trim(),
        url: titleEl?.href,
        path: titleEl?.getAttribute("href"),
        tags,
        published_at_text: timeEl?.textContent?.trim(),
        reading_time_minutes: readingMatch ? parseInt(readingMatch[1], 10) : undefined,
        comments_text: commentsLink?.textContent?.trim(),
        user: {
          name: authorName === authorUsername ? undefined : authorName,
          username: authorUsername,
        },
      };
    });
    return { count: document.querySelectorAll("article.crayons-story").length, articles };
  }, limit);

  if (result.count === 0 && result.articles.length === 0) {
    throwEmptyResult(`No articles found for query "${query}"`);
  }

  // Parse relative dates client-side after extraction.
  const articles = result.articles.map((a) => {
    const parsed = parseRelativeDate(a.published_at_text);
    return {
      ...a,
      published_at: parsed.iso,
      published_at_text: parsed.text,
    };
  });

  return { articles, source: "browser" };
}

export default async (page, params, cwd) => {
  const query = (params.query || "").trim();
  if (!query) {
    throwInvalidParam("query is required and cannot be empty");
  }

  const sort = (params.sort || "relevance").trim().toLowerCase();
  if (!["relevance", "newest", "oldest"].includes(sort)) {
    throwInvalidParam("sort must be one of: relevance, newest, oldest");
  }

  const limit = parseLimit(params.limit);

  // newest/oldest are only available through the browser path.
  if (sort === "newest" || sort === "oldest") {
    const { articles, source } = await searchViaBrowser(page, query, sort, limit);
    return omitNullish({ query, sort, source, articles });
  }

  // relevance: try API first, fall back to browser on failure.
  try {
    const { articles, source } = await searchViaApi(query, limit);
    return omitNullish({ query, sort, source, articles });
  } catch (apiErr) {
    const { articles, source } = await searchViaBrowser(page, query, sort, limit);
    return omitNullish({ query, sort, source, articles, fallback_reason: apiErr.message });
  }
};
