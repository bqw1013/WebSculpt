import fs from "fs";

const PERIOD_DAYS = {
  week: 7,
  month: 30,
  year: 365,
  infinity: 3650,
};

const ALLOWED_SORTS = new Set(["popular", "latest", "top"]);
const ALLOWED_PERIODS = new Set(["week", "month", "year", "infinity"]);
const MAX_LIMIT = 1000;

function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

function omitNullish(obj) {
  if (Array.isArray(obj)) {
    return obj.map(omitNullish);
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      out[k] = omitNullish(v);
    }
    return out;
  }
  return obj;
}

async function fetchApiArticles(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    throwError("RATE_LIMITED", "API rate limited");
  }
  if (res.status >= 500) {
    throwError("NETWORK_ERROR", `API server error ${res.status}`);
  }
  if (!res.ok) {
    throwError("NETWORK_ERROR", `API request failed with status ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throwError("NETWORK_ERROR", "API returned non-JSON response");
  }

  return await res.json();
}

function buildApiUrl({ sort, period, tag, user, org, limit }) {
  const query = new URLSearchParams();
  query.set("per_page", String(limit));

  if (tag) {
    query.set("tag", tag);
  }

  const account = user || org || "";
  if (account) {
    query.set("username", account);
  }

  if (sort === "latest") {
    query.set("state", "fresh");
  } else if (sort === "top") {
    query.set("top", String(PERIOD_DAYS[period] ?? PERIOD_DAYS.infinity));
  }

  return `https://dev.to/api/articles?${query.toString()}`;
}

function normalizeApiArticle(raw) {
  const article = {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    url: raw.url,
    path: raw.path,
    slug: raw.slug,
    canonical_url: raw.canonical_url,
    published_at: raw.published_at || raw.published_timestamp,
    created_at: raw.created_at,
    edited_at: raw.edited_at,
    crossposted_at: raw.crossposted_at,
    last_comment_at: raw.last_comment_at,
    reading_time_minutes: raw.reading_time_minutes,
    language: raw.language,
    tags: Array.isArray(raw.tag_list) ? raw.tag_list : [],
    comments_count: raw.comments_count,
    public_reactions_count: raw.public_reactions_count,
    positive_reactions_count: raw.positive_reactions_count,
    cover_image: raw.cover_image,
    author: raw.user
      ? {
          name: raw.user.name,
          username: raw.user.username,
          profile_image: raw.user.profile_image,
        }
      : undefined,
    organization: raw.organization
      ? {
          name: raw.organization.name,
          username: raw.organization.username,
          profile_image: raw.organization.profile_image,
        }
      : undefined,
    flare_tag: raw.flare_tag
      ? {
          name: raw.flare_tag.name,
          bg_color_hex: raw.flare_tag.bg_color_hex,
          text_color_hex: raw.flare_tag.text_color_hex,
        }
      : undefined,
  };

  return omitNullish(article);
}

async function extractWithApi(args) {
  const url = buildApiUrl(args);
  const data = await fetchApiArticles(url);

  if (!Array.isArray(data)) {
    throwError("NETWORK_ERROR", "API returned unexpected data shape");
  }

  if (data.length === 0) {
    return { source: "api", articles: [] };
  }

  return {
    source: "api",
    articles: data.map(normalizeApiArticle),
  };
}

function buildBrowserUrl({ tag, user, org }) {
  if (tag) return `https://dev.to/t/${encodeURIComponent(tag)}`;
  const account = user || org;
  if (account) return `https://dev.to/${encodeURIComponent(account)}`;
  return "https://dev.to/";
}

async function applyNaturalInteraction(page) {
  await page.evaluate(() => {
    const dy = 200 + Math.floor(Math.random() * 200);
    window.scrollBy(0, dy);
  });
  const delay = 500 + Math.floor(Math.random() * 800);
  await new Promise((r) => setTimeout(r, delay));
}

async function extractWithBrowser(page, args) {
  const url = buildBrowserUrl(args);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  await applyNaturalInteraction(page);

  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    notFound:
      document.title.includes("404") ||
      document.body.innerText.includes("doesn't exist") ||
      document.body.innerText.includes("Page Not Found"),
    url: location.href,
  }));

  if (pageInfo.notFound) {
    throwError("NOT_FOUND", "User or tag not found");
  }

  const rawArticles = await page.evaluate((limit) => {
    const cards = Array.from(document.querySelectorAll("article.crayons-story")).slice(0, limit);
    return cards.map((card) => {
      const titleLink = card.querySelector("a.crayons-story__hidden-navigation-link, h2 a, h3 a");
      const timeEl = card.querySelector("time");
      const authorLink = card.querySelector('a[href^="/@"]');
      const tagEls = Array.from(card.querySelectorAll('a.crayons-tag, a[href^="/t/"]'));
      const reactionDiv = card.querySelector(".multiple_reactions_aggregate");
      const text = card.textContent || "";
      const commentMatch = text.match(/(\d+)\s*comments?/i);
      const readingMatch = text.match(/(\d+)\s*min\s*read/i);

      return {
        title: titleLink?.innerText?.trim(),
        path: titleLink?.getAttribute("href"),
        published_at: timeEl?.getAttribute("datetime") || timeEl?.innerText?.trim(),
        author_name: authorLink?.innerText?.trim(),
        author_username: authorLink?.getAttribute("href")?.replace(/^\//, ""),
        tags: tagEls.map((t) => t.innerText.replace(/\s+/g, "").trim()).filter(Boolean),
        reaction_count: reactionDiv ? reactionDiv.textContent.match(/(\d+)/)?.[1] : null,
        comment_count: commentMatch ? commentMatch[1] : null,
        reading_time_minutes: readingMatch ? parseInt(readingMatch[1], 10) : null,
      };
    });
  }, args.limit);

  const articles = rawArticles
    .filter((raw) => raw.title && raw.path)
    .map((raw) =>
      omitNullish({
        title: raw.title,
        url: raw.path ? `https://dev.to${raw.path}` : undefined,
        path: raw.path,
        published_at: raw.published_at,
        reading_time_minutes: raw.reading_time_minutes,
        tags: raw.tags,
        comments_count: raw.comment_count ? parseInt(raw.comment_count, 10) : undefined,
        public_reactions_count: raw.reaction_count ? parseInt(raw.reaction_count, 10) : undefined,
        author:
          raw.author_name || raw.author_username
            ? {
                name: raw.author_name,
                username: raw.author_username,
              }
            : undefined,
      })
    );

  return { source: "browser", articles };
}

export default async (page, params, cwd) => {
  const sort = (params.sort || "popular").toLowerCase();
  const period = (params.period || "infinity").toLowerCase();
  const tag = params.tag || "";
  const user = params.user || "";
  const org = params.org || "";
  const limitRaw = parseInt(params.limit || "30", 10);

  if (!ALLOWED_SORTS.has(sort)) {
    throwError("INVALID_PARAM", `sort must be one of: popular, latest, top`);
  }
  if (!ALLOWED_PERIODS.has(period)) {
    throwError("INVALID_PARAM", `period must be one of: week, month, year, infinity`);
  }

  const filters = [tag, user, org].filter(Boolean);
  if (filters.length > 1) {
    throwError("INVALID_PARAM", "only one of tag, user, or org may be specified");
  }

  if (Number.isNaN(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIMIT) {
    throwError("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}`);
  }

  const args = { sort, period, tag, user, org, limit: limitRaw };

  let apiError = null;
  try {
    let forceBrowser = false;
    try {
      await fs.promises.access("/tmp/.websculpt_devto_force_browser");
      forceBrowser = true;
    } catch {}
    if (forceBrowser) {
      throw new Error("forced browser fallback for testing");
    }
    const result = await extractWithApi(args);
    if (result.articles.length === 0) {
      throwError("EMPTY_RESULT", "No articles found");
    }
    return result;
  } catch (err) {
    if (err.code === "EMPTY_RESULT") throw err;
    apiError = err;
  }

  let browserResult;
  try {
    browserResult = await extractWithBrowser(page, args);
  } catch (err) {
    if (err.code === "NOT_FOUND") throw err;
    if (err.message && err.message.includes("BROWSER_ATTACH_REQUIRED")) {
      throwError("BROWSER_ATTACH_REQUIRED", "Chrome remote debugging is not available");
    }
    throwError("NETWORK_ERROR", `API and browser fallback both failed: ${apiError?.message}; ${err.message}`);
  }

  if (browserResult.articles.length === 0) {
    throwError("EMPTY_RESULT", "No articles found");
  }

  return browserResult;
};
