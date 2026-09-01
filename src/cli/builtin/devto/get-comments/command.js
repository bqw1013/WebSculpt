// Fetch comments on a DEV.to article.
// Primary path: Forem public API.
// Fallback path: extract the visible comments from the public article page.

import fs from "fs";

const MAX_LIMIT = 1000;
const ALLOWED_HOSTS = new Set(["dev.to", "www.dev.to"]);

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function omitNullFields(value) {
  if (Array.isArray(value)) {
    return value.map(omitNullFields);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === null || val === undefined) continue;
      cleaned[key] = omitNullFields(val);
    }
    return cleaned;
  }
  return value;
}

function parseArticleUrl(inputUrl) {
  if (isBlank(inputUrl)) {
    throw makeError("INVALID_PARAM", "article_url is required when article_id is omitted");
  }

  let parsed;
  try {
    parsed = new URL(inputUrl.trim());
  } catch {
    throw makeError("INVALID_PARAM", "article_url is not a valid URL");
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw makeError("INVALID_PARAM", "article_url must be a https://dev.to article URL");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw makeError("INVALID_PARAM", "article_url path must be /{username}/{slug}");
  }

  const [username, slug] = parts;
  return {
    articleUrl: inputUrl.trim(),
    username: decodeURIComponent(username),
    slug: decodeURIComponent(slug),
  };
}

function parseArticleId(inputId) {
  if (isBlank(inputId)) {
    throw makeError("INVALID_PARAM", "article_id is required when article_url is omitted");
  }
  const id = parseInt(String(inputId).trim(), 10);
  if (Number.isNaN(id) || id <= 0) {
    throw makeError("INVALID_PARAM", "article_id must be a positive integer");
  }
  return id;
}

function parseLimit(inputLimit) {
  const limit = parseInt(String(inputLimit).trim(), 10);
  if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw makeError("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}

function parseIncludeChildren(input) {
  return String(input).trim().toLowerCase() === "true";
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (networkErr) {
    throw makeError("NETWORK_ERROR", `Failed to fetch ${url}: ${networkErr.message}`);
  }
  return response;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (parseErr) {
    throw makeError("NETWORK_ERROR", `Failed to parse API response: ${parseErr.message}`);
  }
}

function classifyHttpError(status, reason) {
  if (status === 404) return makeError("NOT_FOUND", reason);
  if (status === 429) return makeError("RATE_LIMITED", reason);
  if (status >= 500) return makeError("NETWORK_ERROR", reason);
  return makeError("NETWORK_ERROR", reason);
}

async function resolveArticleByUrl(articleUrl) {
  const { username, slug } = parseArticleUrl(articleUrl);
  const apiUrl = `https://dev.to/api/articles/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
  const response = await fetchJson(apiUrl);

  if (!response.ok) {
    const reason = await response.text().catch(() => "request failed");
    throw classifyHttpError(response.status, reason);
  }

  const data = await parseJsonResponse(response);
  return {
    articleId: data.id,
    articleUrl: data.url || articleUrl,
    commentsCount: data.comments_count,
  };
}

async function fetchCommentsById(articleId) {
  const apiUrl = `https://dev.to/api/comments?a_id=${encodeURIComponent(articleId)}`;
  const response = await fetchJson(apiUrl);

  if (!response.ok) {
    const reason = await response.text().catch(() => "request failed");
    throw classifyHttpError(response.status, reason);
  }

  const data = await parseJsonResponse(response);
  if (!Array.isArray(data)) {
    throw makeError("NETWORK_ERROR", "API returned unexpected data shape");
  }
  return data;
}

function normalizeUser(rawUser) {
  if (!rawUser) return undefined;
  return omitNullFields({
    name: rawUser.name,
    username: rawUser.username,
    profile_image: rawUser.profile_image,
    profile_image_90: rawUser.profile_image_90,
  });
}

function normalizeComment(raw, includeChildren) {
  const comment = {
    id_code: raw.id_code,
    created_at: raw.created_at,
    body_html: raw.body_html,
    user: normalizeUser(raw.user),
  };

  if (includeChildren && Array.isArray(raw.children) && raw.children.length > 0) {
    comment.children = raw.children.map((child) => normalizeComment(child, true));
  }

  return omitNullFields(comment);
}

function applyTopLevelLimit(comments, limit) {
  return comments.slice(0, limit);
}

async function naturalInteraction(page) {
  const delay = 300 + Math.floor(Math.random() * 700);
  await page.waitForTimeout(delay);

  const scrollDistance = 200 + Math.floor(Math.random() * 300);
  await page.evaluate((distance) => {
    window.scrollBy({ top: distance, behavior: "smooth" });
  }, scrollDistance);

  await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
}

async function extractFromBrowser(page, articleUrl, limit, includeChildren) {
  try {
    await page.goto(articleUrl, { waitUntil: "domcontentloaded" });
  } catch (navErr) {
    const message = navErr?.message || "";
    if (/attach|browser/i.test(message)) {
      throw makeError("BROWSER_ATTACH_REQUIRED", "Unable to attach to Chrome; please enable remote debugging.");
    }
    throw makeError("NETWORK_ERROR", `Failed to load page: ${message}`);
  }

  await naturalInteraction(page);

  const extraction = await page.evaluate((includeChildren) => {
    const articleContainer = document.querySelector("#article-show-container");
    const articleIdRaw = articleContainer ? articleContainer.getAttribute("data-article-id") : null;
    const commentsCountEl = document.querySelector(".js-comments-count");
    const commentsCount = commentsCountEl
      ? parseInt(commentsCountEl.getAttribute("data-comments-count") || "0", 10)
      : null;

    const bodyText = document.body.innerText || "";
    const notFound =
      document.title.startsWith("404:") ||
      /doesn't exist|not be published|page not found/i.test(bodyText);

    const rootNodes = Array.from(document.querySelectorAll("#comments .single-comment-node.root"));

    const extractNode = (node) => {
      const header = node.querySelector(".comment__header");
      const body = node.querySelector(".comment__body");
      const time = node.querySelector("time[datetime]");
      const avatar = node.querySelector("img");

      const pathAttr = node.getAttribute("data-path") || "";
      const pathMatch = pathAttr.match(/\/comments\/([^/]+)$/);
      const anchor = node.querySelector("a[name^='comment-']");
      const idCode = pathMatch
        ? pathMatch[1]
        : anchor
          ? anchor.getAttribute("name").replace("comment-", "")
          : null;

      const authorLink = node.querySelector("a[href^='https://dev.to/'], a[href^='/']");
      const username = authorLink
        ? (authorLink.getAttribute("href") || "")
            .replace(/^https:\/\/dev\.to\//, "")
            .replace(/^\//, "")
            .split("/")[0]
        : null;

      const comment = {
        id_code: idCode,
        created_at: time ? time.getAttribute("datetime") : null,
        body_html: body ? body.innerHTML.trim() : null,
        user: authorLink
          ? {
              name: header
                ? header.textContent.trim().split("\n")[0].trim()
                : authorLink.textContent.trim(),
              username,
              profile_image: avatar ? avatar.getAttribute("src") : null,
            }
          : null,
      };

      if (includeChildren) {
        const childNodes = Array.from(
          node.querySelectorAll(":scope > .comment__children > .single-comment-node")
        );
        if (childNodes.length > 0) {
          comment.children = childNodes.map(extractNode);
        }
      }

      return comment;
    };

    const comments = rootNodes.map(extractNode);

    return {
      notFound,
      articleId: articleIdRaw ? parseInt(articleIdRaw, 10) : null,
      commentsCount,
      comments,
    };
  }, includeChildren);

  if (extraction.notFound) {
    throw makeError("NOT_FOUND", "Article not found");
  }

  if ((extraction.commentsCount === 0 || extraction.commentsCount === null) && extraction.comments.length === 0) {
    throw makeError("EMPTY_RESULT", "No comments found on this article");
  }

  const limitedComments = applyTopLevelLimit(extraction.comments, limit);

  return {
    article_id: extraction.articleId,
    article_url: articleUrl,
    comments_count: extraction.commentsCount,
    comments: limitedComments,
    truncated: true,
    source: "browser",
  };
}

async function checkForceBrowserFallback() {
  try {
    await fs.promises.access("/tmp/.websculpt_devto_force_browser");
    return true;
  } catch {
    return false;
  }
}

export default async (page, params, cwd) => {
  const hasUrl = !isBlank(params.article_url);
  const hasId = !isBlank(params.article_id);

  if (hasUrl && hasId) {
    throw makeError("INVALID_PARAM", "provide either article_url or article_id, not both");
  }
  if (!hasUrl && !hasId) {
    throw makeError("INVALID_PARAM", "provide either article_url or article_id");
  }

  const limit = parseLimit(params.limit);
  const includeChildren = parseIncludeChildren(params.include_children);

  let articleId;
  let articleUrl;
  let commentsCount;
  let apiError = null;

  if (hasUrl) {
    try {
      const resolved = await resolveArticleByUrl(params.article_url);
      articleId = resolved.articleId;
      articleUrl = resolved.articleUrl;
      commentsCount = resolved.commentsCount;
    } catch (err) {
      if (err.code === "NOT_FOUND" || err.code === "INVALID_PARAM") throw err;
      apiError = err;
      articleUrl = params.article_url.trim();
    }

    if (commentsCount === 0) {
      throw makeError("EMPTY_RESULT", "No comments found on this article");
    }
  } else {
    articleId = parseArticleId(params.article_id);
  }

  let apiComments;
  try {
    if (await checkForceBrowserFallback()) {
      throw new Error("forced browser fallback for testing");
    }
    if (articleId) {
      apiComments = await fetchCommentsById(articleId);
    } else {
      throw new Error("no article id resolved");
    }
  } catch (err) {
    if (err.code === "NOT_FOUND" || err.code === "INVALID_PARAM") throw err;
    apiError = err;
  }

  if (apiComments) {
    if (apiComments.length === 0) {
      throw makeError("EMPTY_RESULT", "No comments found on this article");
    }

    const limitedComments = applyTopLevelLimit(apiComments, limit);
    const normalizedComments = limitedComments.map((comment) => normalizeComment(comment, includeChildren));

    return omitNullFields({
      article_id: articleId,
      article_url: articleUrl,
      comments_count: commentsCount !== undefined ? commentsCount : apiComments.length,
      comments: normalizedComments,
      source: "api",
    });
  }

  if (!articleUrl) {
    if (apiError && apiError.code) throw apiError;
    throw makeError("NETWORK_ERROR", apiError ? apiError.message : "API request failed and no article_url provided for browser fallback");
  }

  const browserResult = await extractFromBrowser(page, articleUrl, limit, includeChildren);
  return omitNullFields(browserResult);
};
