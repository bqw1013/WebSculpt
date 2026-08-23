// medium/get-article — fetch a single Medium article's metadata, body, and optional responses.
// Data source: window.__APOLLO_STATE__ (primary). Responses are loaded from Medium's
// PagedThreadedPostResponsesQuery GraphQL endpoint.

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs, maxMs) {
  return sleep(randomInt(minMs, maxMs));
}

function parsePostId(rawUrl) {
  // Supported forms:
  // https://medium.com/@<user>/<slug>-<postId>
  // https://medium.com/<publication>/<slug>-<postId>
  // The post id is the last 12-character hex segment before any query string.
  let path;
  try {
    const url = new URL(rawUrl);
    // Reject obvious non-Medium hosts (subdomains such as blog.medium.com are allowed).
    if (!/\.?medium\.com$/i.test(url.hostname)) return null;
    path = url.pathname;
  } catch {
    return null;
  }
  path = path.replace(/\/$/, "");
  const match = path.match(/-([0-9a-f]{12})$/i);
  return match ? match[1].toLowerCase() : null;
}

function validateBooleanParam(value, name) {
  if (value === undefined || value === null || value === "") return false;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw makeError("INVALID_PARAM", `${name} must be "true" or "false"`);
}

function validateResponsesLimit(value) {
  if (value === undefined || value === null || value === "") return 50;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1 || n > 200) {
    throw makeError("INVALID_PARAM", "responses_limit must be an integer between 1 and 200");
  }
  return n;
}

function isoFromMs(ts) {
  if (typeof ts !== "number" || Number.isNaN(ts)) return null;
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

function applyMarkups(text, markups) {
  if (!text || !Array.isArray(markups) || markups.length === 0) return text;
  const sorted = [...markups].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.start > cursor) {
      segments.push(text.slice(cursor, m.start));
    }
    let tag = "span";
    let attrs = "";
    if (m.type === "A") {
      tag = "a";
      attrs = m.href ? ` href="${m.href}"` : "";
    } else if (m.type === "EM") {
      tag = "em";
    } else if (m.type === "STRONG") {
      tag = "strong";
    } else if (m.type === "CODE") {
      tag = "code";
    } else if (m.type === "STRIKE") {
      tag = "s";
    }
    segments.push(`<${tag}${attrs}>${text.slice(m.start, m.end)}</${tag}>`);
    cursor = m.end;
  }
  if (cursor < text.length) segments.push(text.slice(cursor));
  return segments.join("");
}

function buildBody(paragraphs) {
  const textParts = [];
  const htmlParts = [];
  let inList = null; // 'ul' | 'ol' | null

  function closeList() {
    if (!inList) return;
    htmlParts.push(`</${inList}>`);
    inList = null;
  }

  function openList(type) {
    if (inList === type) return;
    closeList();
    inList = type;
    htmlParts.push(`<${type}>`);
  }

  for (const p of paragraphs) {
    const text = typeof p.text === "string" ? p.text : "";
    const htmlText = applyMarkups(text, p.markups);
    const type = p.type;

    if (type === "P") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<p>${htmlText}</p>`);
    } else if (type === "H3") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<h3>${htmlText}</h3>`);
    } else if (type === "H4") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<h4>${htmlText}</h4>`);
    } else if (type === "H2") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<h2>${htmlText}</h2>`);
    } else if (type === "ULI") {
      openList("ul");
      textParts.push(`• ${text}`);
      htmlParts.push(`<li>${htmlText}</li>`);
    } else if (type === "OLI") {
      openList("ol");
      textParts.push(text);
      htmlParts.push(`<li>${htmlText}</li>`);
    } else if (type === "IMG") {
      closeList();
      const caption = text || "";
      const imgId = p.metadata && p.metadata.id ? p.metadata.id : "";
      const src = imgId ? `https://miro.medium.com/v2/resize:fit:1200/${imgId}` : "";
      textParts.push(caption || "[image]");
      if (src) {
        htmlParts.push(
          `<figure><img src="${src}" alt="${caption}" /><figcaption>${htmlText}</figcaption></figure>`
        );
      } else {
        htmlParts.push(`<figure><figcaption>${htmlText}</figcaption></figure>`);
      }
    } else if (type === "QUOTE") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<blockquote>${htmlText}</blockquote>`);
    } else if (type === "PRE" || type === "CODE") {
      closeList();
      textParts.push(text);
      htmlParts.push(`<pre><code>${htmlText}</code></pre>`);
    } else if (type === "MIXTAPE_EMBED" || type === "EMBED") {
      closeList();
      const title = p.text || (p.mixtapeMetadata && p.mixtapeMetadata.title) || "";
      textParts.push(title || "[embed]");
      htmlParts.push(`<div class="embed">${htmlText || title}</div>`);
    } else {
      // Unknown paragraph type: include as plain paragraph.
      closeList();
      textParts.push(text);
      htmlParts.push(`<p>${htmlText}</p>`);
    }
  }
  closeList();

  return {
    text: textParts.join("\n\n"),
    html: htmlParts.join("\n"),
  };
}

async function extractResponses(page, postId, limit, expandResponses) {
  // Responses are loaded via Medium's PagedThreadedPostResponsesQuery GraphQL endpoint.
  // expand_responses is accepted for contract compatibility but is a no-op: the GraphQL
  // response already contains the full response body, so no additional expansion is needed.
  const GRAPHQL_URL = "/_/graphql";
  const PAGE_SIZE = 10;

  const query = `
    query PagedThreadedPostResponsesQuery($postId: ID!, $postResponsesPaging: PagingOptions, $sortType: ResponseSortType) {
      post(id: $postId) {
        threadedPostResponses(paging: $postResponsesPaging, sortType: $sortType) {
          posts {
            id
            title
            mediumUrl
            uniqueSlug
            firstPublishedAt
            latestPublishedAt
            readingTime
            clapCount
            previewImage { id }
            extendedPreviewContent { subtitle isFullContent }
            creator { id name username imageId }
            content(postMeteringOptions: {}) {
              isLockedPreviewOnly
              bodyModel {
                paragraphs {
                  id
                  type
                  text
                  markups { type start end href anchorType userId }
                  metadata { id originalHeight originalWidth }
                }
              }
            }
          }
          pagingInfo {
            next { limit to }
          }
        }
      }
    }
  `;

  const responses = [];
  let paging = { limit: Math.min(PAGE_SIZE, limit) };
  let pageNum = 0;
  const maxPages = Math.ceil(limit / PAGE_SIZE) + 2;

  while (responses.length < limit && pageNum < maxPages) {
    const result = await page.evaluate(
      async ({ url, query, variables }) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              query,
              variables,
              operationName: "PagedThreadedPostResponsesQuery",
            }),
          });
          const text = await res.text();
          return { status: res.status, text };
        } catch (err) {
          return { error: err.message };
        }
      },
      {
        url: GRAPHQL_URL,
        query,
        variables: {
          postId,
          postResponsesPaging: paging,
          sortType: "TOP",
        },
      }
    );

    if (result.error) {
      return {
        responses,
        partialReason: `GraphQL request failed: ${result.error}`,
      };
    }
    if (result.status !== 200) {
      return {
        responses,
        partialReason: `GraphQL request returned HTTP ${result.status}: ${result.text.slice(0, 200)}`,
      };
    }

    let data;
    try {
      data = JSON.parse(result.text);
    } catch (err) {
      return {
        responses,
        partialReason: `GraphQL response is not valid JSON: ${err.message}`,
      };
    }

    if (data.errors && data.errors.length > 0) {
      return {
        responses,
        partialReason: `GraphQL errors: ${data.errors.map((e) => e.message).join("; ")}`,
      };
    }

    const posts = data?.data?.post?.threadedPostResponses?.posts || [];
    const nextPaging = data?.data?.post?.threadedPostResponses?.pagingInfo?.next;

    for (const post of posts) {
      if (responses.length >= limit) break;
      const creator = post.creator || {};
      const username = creator.username || "";
      const content = post.content || {};
      const bodyModel = content.bodyModel || {};
      const paragraphs = bodyModel.paragraphs || [];
      const body = buildBody(paragraphs);

      responses.push({
        author: {
          name: creator.name || "Unknown",
          username,
          profileUrl: username ? `https://medium.com/@${username}` : "",
        },
        title: post.title || "",
        subtitle: post.extendedPreviewContent?.subtitle || "",
        text: body.text,
        html: body.html,
        clapCount: typeof post.clapCount === "number" ? post.clapCount : 0,
        url: post.mediumUrl || "",
        postId: post.id || "",
        uniqueSlug: post.uniqueSlug || "",
        publishedAt: isoFromMs(post.firstPublishedAt),
        updatedAt: isoFromMs(post.latestPublishedAt),
        readingTimeMinutes:
          typeof post.readingTime === "number"
            ? Math.max(1, Math.round(post.readingTime))
            : null,
        isLockedPreviewOnly: content.isLockedPreviewOnly === true,
      });
    }

    if (!nextPaging || typeof nextPaging.to !== "string") break;
    paging = {
      limit: Math.min(PAGE_SIZE, limit - responses.length),
      to: nextPaging.to,
    };
    pageNum++;
  }

  const partialReason =
    responses.length >= limit
      ? null
      : `Loaded ${responses.length} response(s) via GraphQL`;
  return { responses, partialReason };
}

export default async (page, params, cwd) => {
  const rawUrl = (params.url || "").trim();
  if (!rawUrl) {
    throw makeError("MISSING_PARAM", "Required parameter 'url' is missing or empty");
  }

  const postId = parsePostId(rawUrl);
  if (!postId) {
    throw makeError(
      "INVALID_PARAM",
      "url must be a Medium article URL ending with a 12-character hex post id, e.g. https://medium.com/@user/slug-abc123def456"
    );
  }

  const includeResponses = validateBooleanParam(params.include_responses, "include_responses");
  const expandResponses = validateBooleanParam(params.expand_responses, "expand_responses");
  const responsesLimit = validateResponsesLimit(params.responses_limit);

  if (expandResponses && !includeResponses) {
    throw makeError(
      "INVALID_PARAM",
      "expand_responses can only be true when include_responses is true"
    );
  }

  // Navigate to the article page.
  await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Light interaction with random delays to keep a polite pacing profile.
  try {
    const viewport = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    if (viewport && viewport.w > 0 && viewport.h > 0) {
      await page.mouse.move(
        randomInt(20, Math.max(20, viewport.w - 20)),
        randomInt(20, Math.max(20, viewport.h - 20))
      );
      await randomDelay(150, 400);
      await page.evaluate(
        (top) => window.scrollBy({ top, behavior: "smooth" }),
        randomInt(100, 350)
      );
      await randomDelay(250, 600);
    }
  } catch {
    // Harmless interaction errors should not block extraction.
  }

  // Wait for Apollo state to hydrate and contain the target Post.
  let apolloReady = false;
  try {
    await page.waitForFunction(
      (id) => {
        const s = window.__APOLLO_STATE__;
        if (!s) return false;
        return Object.keys(s).some(
          (k) =>
            k.startsWith("Post:") &&
            s[k] &&
            typeof s[k].id === "string" &&
            s[k].id.toLowerCase() === id.toLowerCase()
        );
      },
      postId,
      { timeout: 20000 }
    );
    apolloReady = true;
  } catch {
    apolloReady = false;
  }

  // Inspect final page state for 404 / error signals when Apollo is not ready.
  if (!apolloReady) {
    const state = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      hasApollo: !!window.__APOLLO_STATE__,
      hasArticle: !!document.querySelector("article"),
      bodyText: document.body.innerText.slice(0, 400),
    }));
    const bodyLower = state.bodyText.toLowerCase();
    const titleLower = (state.title || "").toLowerCase();
    if (
      titleLower.includes("404") ||
      titleLower.includes("page not found") ||
      bodyLower.includes("page not found") ||
      state.url.includes("/404") ||
      (!state.hasApollo && !state.hasArticle)
    ) {
      throw makeError("NOT_FOUND", `Article not found for url: ${rawUrl}`);
    }
    throw makeError("PAGE_LOAD_FAILED", "Apollo state did not hydrate within timeout");
  }

  // Extract article metadata and body from Apollo state.
  const article = await page.evaluate(
    ({ targetPostId, rawUrl }) => {
      const state = window.__APOLLO_STATE__;
      if (!state) return { __error: "APOLLO_STATE_NOT_FOUND" };

      const mainKey = Object.keys(state).find(
        (k) =>
          k.startsWith("Post:") &&
          state[k] &&
          typeof state[k].id === "string" &&
          state[k].id.toLowerCase() === targetPostId.toLowerCase()
      );
      if (!mainKey) return { __error: "POST_NOT_FOUND" };
      const post = state[mainKey];

      function resolveUser(ref) {
        if (!ref || !ref.__ref) return null;
        const u = state[ref.__ref];
        if (!u) return null;
        const username = u.username || "";
        return {
          name: u.name || "Unknown",
          username,
          profileUrl: username ? `https://medium.com/@${username}` : "",
          bio: u.bio || null,
          followerCount:
            u.socialStats && typeof u.socialStats.followerCount === "number"
              ? u.socialStats.followerCount
              : null,
        };
      }

      function resolvePublication(ref) {
        if (!ref || !ref.__ref) return null;
        const c = state[ref.__ref];
        if (!c) return null;
        const slug = c.slug || "";
        return {
          name: c.name || "",
          slug,
          url: c.mediumUrl || (slug ? `https://medium.com/${slug}` : ""),
          description: c.description || null,
          subscriberCount:
            typeof c.subscriberCount === "number" ? c.subscriberCount : null,
        };
      }

      function resolveTags(tagRefs) {
        const tags = [];
        const topicSlugs = [];
        if (!Array.isArray(tagRefs)) return { tags, topics: topicSlugs };
        for (const tr of tagRefs) {
          if (!tr || !tr.__ref) continue;
          const t = state[tr.__ref];
          if (!t) continue;
          if (t.displayTitle) tags.push(t.displayTitle);
          else if (t.id) tags.push(t.id);
          const slug = t.normalizedTagSlug || t.id || "";
          if (slug) topicSlugs.push(slug);
        }
        return { tags, topics: topicSlugs };
      }

      function isoFromMs(ts) {
        if (typeof ts !== "number" || Number.isNaN(ts)) return null;
        try {
          return new Date(ts).toISOString();
        } catch {
          return String(ts);
        }
      }

      function buildPreviewImage(pImg) {
        if (pImg && typeof pImg.id === "string") {
          return `https://miro.medium.com/v2/resize:fit:1200/${pImg.id}`;
        }
        return null;
      }

      function applyMarkups(text, markups) {
        if (!text || !Array.isArray(markups) || markups.length === 0) return text;
        const sorted = [...markups].sort((a, b) => a.start - b.start);
        const segments = [];
        let cursor = 0;
        for (const m of sorted) {
          if (m.start > cursor) {
            segments.push(text.slice(cursor, m.start));
          }
          let tag = "span";
          let attrs = "";
          if (m.type === "A") {
            tag = "a";
            attrs = m.href ? ` href="${m.href}"` : "";
          } else if (m.type === "EM") {
            tag = "em";
          } else if (m.type === "STRONG") {
            tag = "strong";
          } else if (m.type === "CODE") {
            tag = "code";
          } else if (m.type === "STRIKE") {
            tag = "s";
          }
          segments.push(`<${tag}${attrs}>${text.slice(m.start, m.end)}</${tag}>`);
          cursor = m.end;
        }
        if (cursor < text.length) segments.push(text.slice(cursor));
        return segments.join("");
      }

      function buildBody(paragraphs) {
        const textParts = [];
        const htmlParts = [];
        let inList = null; // 'ul' | 'ol' | null

        function closeList() {
          if (!inList) return;
          htmlParts.push(`</${inList}>`);
          inList = null;
        }

        function openList(type) {
          if (inList === type) return;
          closeList();
          inList = type;
          htmlParts.push(`<${type}>`);
        }

        for (const p of paragraphs) {
          const text = typeof p.text === "string" ? p.text : "";
          const htmlText = applyMarkups(text, p.markups);
          const type = p.type;

          if (type === "P") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<p>${htmlText}</p>`);
          } else if (type === "H3") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<h3>${htmlText}</h3>`);
          } else if (type === "H4") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<h4>${htmlText}</h4>`);
          } else if (type === "H2") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<h2>${htmlText}</h2>`);
          } else if (type === "ULI") {
            openList("ul");
            textParts.push(`• ${text}`);
            htmlParts.push(`<li>${htmlText}</li>`);
          } else if (type === "OLI") {
            openList("ol");
            textParts.push(text);
            htmlParts.push(`<li>${htmlText}</li>`);
          } else if (type === "IMG") {
            closeList();
            const caption = text || "";
            const imgId = p.metadata && p.metadata.id ? p.metadata.id : "";
            const src = imgId ? `https://miro.medium.com/v2/resize:fit:1200/${imgId}` : "";
            textParts.push(caption || "[image]");
            if (src) {
              htmlParts.push(
                `<figure><img src="${src}" alt="${caption}" /><figcaption>${htmlText}</figcaption></figure>`
              );
            } else {
              htmlParts.push(`<figure><figcaption>${htmlText}</figcaption></figure>`);
            }
          } else if (type === "QUOTE") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<blockquote>${htmlText}</blockquote>`);
          } else if (type === "PRE" || type === "CODE") {
            closeList();
            textParts.push(text);
            htmlParts.push(`<pre><code>${htmlText}</code></pre>`);
          } else if (type === "MIXTAPE_EMBED" || type === "EMBED") {
            closeList();
            const title = p.text || (p.mixtapeMetadata && p.mixtapeMetadata.title) || "";
            textParts.push(title || "[embed]");
            htmlParts.push(`<div class="embed">${htmlText || title}</div>`);
          } else {
            // Unknown paragraph type: include as plain paragraph.
            closeList();
            textParts.push(text);
            htmlParts.push(`<p>${htmlText}</p>`);
          }
        }
        closeList();

        return {
          text: textParts.join("\n\n"),
          html: htmlParts.join("\n"),
        };
      }

      const author = resolveUser(post.creator);
      const publication = resolvePublication(post.collection) || null;
      const { tags, topics } = resolveTags(post.tags);

      const subtitle =
        (post.extendedPreviewContent && post.extendedPreviewContent.subtitle) ||
        (post.previewContent && post.previewContent.subtitle) ||
        post.seoDescription ||
        "";

      const isMemberOnly = post.isLocked === true || post.visibility === "LOCKED";
      const isFullContent =
        post.extendedPreviewContent && post.extendedPreviewContent.isFullContent === true;

      const contentKey = Object.keys(post).find((k) => k.startsWith("content("));
      let body = { text: "", html: "" };
      if (contentKey && post[contentKey].bodyModel) {
        const paraRefs = post[contentKey].bodyModel.paragraphs || [];
        const paragraphs = paraRefs
          .map((ref) => (ref && ref.__ref ? state[ref.__ref] : null))
          .filter(Boolean);
        body = buildBody(paragraphs);
      }

      const result = {
        title: post.title || "",
        subtitle,
        url: post.mediumUrl || rawUrl,
        postId: post.id || targetPostId,
        author,
        publication,
        firstPublishedAt: isoFromMs(post.firstPublishedAt),
        latestPublishedAt: isoFromMs(post.latestPublishedAt),
        readingTimeMinutes:
          typeof post.readingTime === "number" ? Math.max(1, Math.round(post.readingTime)) : null,
        clapCount: typeof post.clapCount === "number" ? post.clapCount : 0,
        responseCount:
          post.postResponses && typeof post.postResponses.count === "number"
            ? post.postResponses.count
            : 0,
        allowResponses: post.allowResponses === true,
        responsesLocked: post.responsesLocked === true,
        tags,
        topics,
        previewImageUrl: buildPreviewImage(post.previewImage),
        wordCount: typeof post.wordCount === "number" ? post.wordCount : null,
        detectedLanguage: post.detectedLanguage || null,
        isMemberOnly,
        isFullContent,
        bodyText: body.text,
        bodyHtml: body.html,
      };

      const partial = {};
      if (isMemberOnly) {
        partial.body = "Member-only article; returned free preview";
      }
      if (Object.keys(partial).length > 0) {
        result.partial = partial;
      }

      return result;
    },
    { targetPostId: postId, rawUrl }
  );

  if (article && article.__error) {
    if (article.__error === "POST_NOT_FOUND") {
      throw makeError("NOT_FOUND", `Article not found for url: ${rawUrl}`);
    }
    throw makeError(article.__error, `Failed to extract article data for ${rawUrl}`);
  }

  // Optionally load responses via GraphQL.
  if (includeResponses) {
    const { responses, partialReason } = await extractResponses(
      page,
      postId,
      responsesLimit,
      expandResponses
    );
    article.responses = responses;
    if (!article.partial) article.partial = {};
    if (partialReason) article.partial.responses = partialReason;
    if (Object.keys(article.partial).length === 0) {
      delete article.partial;
    }
  }

  await randomDelay(200, 500);
  return article;
};
