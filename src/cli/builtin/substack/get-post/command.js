// Get a single Substack post by URL.
// Primary data source: Substack's /api/v1/posts/<slug> endpoint.
// Fallback: visible DOM selectors if the API drifts or is unavailable.
// Optional: --include_comments true fetches the comment list from /p/<slug>/comments.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default async (page, params, cwd) => {
  const urlParam = params.url;
  if (!urlParam || urlParam.trim().length === 0) {
    const err = new Error("[MISSING_PARAM] url is required");
    err.code = "MISSING_PARAM";
    throw err;
  }

  let url;
  try {
    url = new URL(urlParam.trim());
  } catch {
    const err = new Error("[INVALID_URL] url must be a valid HTTP/HTTPS URL");
    err.code = "INVALID_URL";
    throw err;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const err = new Error("[INVALID_URL] url must use http or https");
    err.code = "INVALID_URL";
    throw err;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const slug = pathParts[pathParts.length - 1];
  if (!slug || slug.length === 0) {
    const err = new Error("[INVALID_URL] could not extract post slug from URL path");
    err.code = "INVALID_URL";
    throw err;
  }

  const includeComments = params.include_comments === "true";

  // Navigate to the post page and wait for it to stabilize.
  await page.goto(urlParam.trim(), { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // networkidle is a best-effort signal; continue even if it times out.
  }
  await sleep(randomBetween(300, 500));

  // Primary path: fetch the Substack internal API.
  async function fetchApi(postSlug) {
    return page.evaluate(async (s) => {
      try {
        const res = await fetch(`/api/v1/posts/${s}`);
        if (!res.ok) {
          return { ok: false, status: res.status, errorText: await res.text() };
        }
        const data = await res.json();
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, postSlug);
  }

  let apiResult = await fetchApi(slug);

  // If a late navigation destroyed the execution context, wait and retry once.
  if (!apiResult.ok && /execution context was destroyed|navigation/i.test(apiResult.error || "")) {
    await sleep(randomBetween(500, 800));
    apiResult = await fetchApi(slug);
  }

  await sleep(randomBetween(200, 400));

  let result;

  if (apiResult.ok && apiResult.data) {
    const data = apiResult.data;

    if (data.error || !data.title) {
      const err = new Error("[NOT_FOUND] Post not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    if (!data.body_html || data.body_html.trim().length === 0) {
      const err = new Error("[EMPTY_BODY] This post has no accessible body (may require subscription)");
      err.code = "EMPTY_BODY";
      throw err;
    }

    const byline = data.publishedBylines?.[0];
    const publicationUser = byline?.publicationUsers?.[0];
    const publication = publicationUser?.publication;

    // Convert body HTML to plain text in the browser context.
    const bodyText = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return doc.body ? doc.body.innerText.trim() : "";
    }, data.body_html);

    result = {
      title: data.title,
      subtitle: data.subtitle || null,
      author: byline?.name || null,
      author_handle: byline?.handle || null,
      publication: publication?.name || null,
      publication_domain: publication?.subdomain
        ? `${publication.subdomain}.substack.com`
        : url.hostname,
      url: urlParam.trim(),
      canonical_url: data.canonical_url || urlParam.trim(),
      post_date: data.post_date || null,
      body_text: bodyText,
      like_count: typeof data.reaction_count === "number" ? data.reaction_count : null,
      comment_count: typeof data.comment_count === "number" ? data.comment_count : null,
      restack_count: typeof data.restacks === "number" ? data.restacks : null,
    };
  } else {
    if (apiResult.status === 404) {
      const err = new Error("[NOT_FOUND] Post not found");
      err.code = "NOT_FOUND";
      throw err;
    }

    // Fallback path: extract from the rendered DOM.
    const domResult = await page.evaluate(() => {
      const titleEl = document.querySelector("h1.post-title");
      const subtitleEl = document.querySelector("main article > region h3");
      const pubLink = document.querySelector('h1 a[href="/"]');
      const pubImg = pubLink?.querySelector("img");
      const authorEls = Array.from(document.querySelectorAll('a[href^="https://substack.com/@"]'));
      const authorLink = authorEls.find((a) => (a.innerText || "").trim().length > 0);
      const timeEl = document.querySelector("time[datetime]");
      const bodyEl = document.querySelector(".available-content");

      const likeBtn = Array.from(document.querySelectorAll('button[aria-label^="Like"]')).find(
        (b) => b.closest("article")
      );
      const commentBtn = Array.from(document.querySelectorAll('button[aria-label*="comments"]')).find(
        (b) => b.closest("article")
      );
      const restackBtn = Array.from(document.querySelectorAll("button.post-ufi-button")).find(
        (b) => !b.getAttribute("aria-label") && /^\d+$/.test((b.textContent || "").trim())
      );

      const parseCount = (btn) => {
        if (!btn) return null;
        const match = (btn.getAttribute("aria-label") || btn.textContent || "").match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
      };

      return {
        title: titleEl ? titleEl.innerText.trim() : null,
        subtitle: subtitleEl ? subtitleEl.innerText.trim() : null,
        publication: pubLink
          ? (pubLink.innerText || "").trim() || pubImg?.getAttribute("alt") || null
          : null,
        author: authorLink ? (authorLink.innerText || "").trim() : null,
        author_url: authorLink ? authorLink.getAttribute("href") : null,
        post_date: timeEl ? timeEl.getAttribute("datetime") : null,
        body_text: bodyEl ? (bodyEl.innerText || "").trim() : null,
        like_count: parseCount(likeBtn),
        comment_count: parseCount(commentBtn),
        restack_count: restackBtn ? parseInt((restackBtn.textContent || "").trim(), 10) : null,
      };
    });

    if (!domResult.title || !domResult.body_text) {
      const err = new Error("[DRIFT_DETECTED] Could not extract post data from API or DOM");
      err.code = "DRIFT_DETECTED";
      throw err;
    }

    const handleMatch = domResult.author_url?.match(/@([^/]+)/);
    result = {
      title: domResult.title,
      subtitle: domResult.subtitle,
      author: domResult.author,
      author_handle: handleMatch ? handleMatch[1] : null,
      publication: domResult.publication,
      publication_domain: url.hostname,
      url: urlParam.trim(),
      canonical_url: urlParam.trim(),
      post_date: domResult.post_date,
      body_text: domResult.body_text,
      like_count: domResult.like_count,
      comment_count: domResult.comment_count,
      restack_count: domResult.restack_count,
    };
  }

  // Optional: fetch comments.
  if (includeComments) {
    const commentsUrl = `${urlParam.trim().replace(/\/$/, "")}/comments`;
    await page.goto(commentsUrl, { waitUntil: "domcontentloaded" });
    await sleep(randomBetween(300, 500));

    const comments = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".comment")).map((c) => {
        const article = c.querySelector('[role="article"]');
        const ariaLabel = article ? article.getAttribute("aria-label") : "";
        const authorMatch = ariaLabel.match(/Comment by (.+)/);
        const author = authorMatch ? authorMatch[1].trim() : null;

        const lines = (c.innerText || "")
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Try to locate body: skip author, time, "Liked by ...", action labels.
        const actionLabels = new Set(["LIKE", "REPLY", "SHARE", "RESTACK"]);
        const bodyLines = [];
        let bodyStarted = false;
        for (const line of lines) {
          if (line === author) continue;
          if (/^(\d+[smhd]|just now|today|yesterday|\w+ \d{1,2})$/i.test(line)) continue;
          if (/^Liked by/i.test(line)) continue;
          if (actionLabels.has(line.toUpperCase()) || /^LIKE\s*\(\d+\)$/i.test(line)) {
            break;
          }
          bodyStarted = true;
          bodyLines.push(line);
        }
        const body = bodyStarted ? bodyLines.join("\n").trim() : lines.slice(-4).join("\n").trim();

        const timeMatch = lines.find((l) => /^(\d+[smhd]|just now|today|yesterday|\w+ \d{1,2})$/i.test(l));
        const likeMatch = lines.find((l) => /^LIKE\s*\((\d+)\)$/i.test(l));

        return {
          author,
          body,
          published_at: timeMatch || null,
          like_count: likeMatch ? parseInt(likeMatch.match(/\d+/)[0], 10) : 0,
        };
      });
    });

    result.comments = comments;
  }

  await sleep(randomBetween(0, 150));
  return result;
};
