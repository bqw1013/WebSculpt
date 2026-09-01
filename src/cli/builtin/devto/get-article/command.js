// Get a single DEV.to article.
// Primary path: Forem public API.
// Fallback path: extract from the public article page using the provided browser page.

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
    throw makeError("INVALID_PARAM", "url is required");
  }

  let parsed;
  try {
    parsed = new URL(inputUrl.trim());
  } catch {
    throw makeError("INVALID_PARAM", "url is not a valid URL");
  }

  const allowedHosts = ["dev.to", "www.dev.to"];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw makeError("INVALID_PARAM", "url must be a https://dev.to article URL");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw makeError("INVALID_PARAM", "url path must be /{username}/{slug}");
  }

  const [username, slug, ...rest] = parts;
  if (rest.length > 0) {
    // Accept extra path segments but only use the first two for the API.
  }

  return {
    articleUrl: inputUrl.trim(),
    username: decodeURIComponent(username),
    slug: decodeURIComponent(slug),
  };
}

async function fetchFromApi(username, slug) {
  const apiUrl = `https://dev.to/api/articles/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`;
  let response;
  try {
    response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });
  } catch (networkErr) {
    return { ok: false, status: null, data: null, reason: networkErr.message };
  }

  if (response.status === 404) {
    return { ok: false, status: 404, data: null, reason: "not found" };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, data: null, reason: `http ${response.status}` };
  }

  try {
    const data = await response.json();
    if (!data || typeof data !== "object") {
      return { ok: false, status: response.status, data: null, reason: "invalid json" };
    }
    return { ok: true, status: response.status, data, reason: null };
  } catch (parseErr) {
    return { ok: false, status: response.status, data: null, reason: parseErr.message };
  }
}

async function naturalInteraction(page) {
  // Small randomized delay to keep the interaction pattern neutral.
  const delay = 300 + Math.floor(Math.random() * 900);
  await page.waitForTimeout(delay);

  // Gentle scroll down and back up.
  const scrollDistance = 100 + Math.floor(Math.random() * 300);
  await page.evaluate((distance) => {
    window.scrollBy({ top: distance, behavior: "smooth" });
  }, scrollDistance);
  await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
  await page.evaluate(() => {
    window.scrollBy({ top: -window.scrollY, behavior: "smooth" });
  });

  // Subtle mouse movement within the viewport.
  const viewport = page.viewportSize() || { width: 1280, height: 800 };
  const x = Math.min(viewport.width - 10, Math.max(10, Math.floor(Math.random() * viewport.width)));
  const y = Math.min(viewport.height - 10, Math.max(10, Math.floor(Math.random() * viewport.height)));
  await page.mouse.move(x, y);
}

async function extractFromBrowser(page, articleUrl) {
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

  const extraction = await page.evaluate(() => {
    const article = document.querySelector("article.crayons-card");
    if (!article) {
      const title = document.title || "";
      const h1 = document.querySelector("h1")?.innerText?.trim() || "";
      return { notFound: title.startsWith("404:") || /doesn't exist|not be published/i.test(h1) };
    }

    const header = article.querySelector("header.crayons-article__header");
    const bodyEl = article.querySelector("#article-body");
    if (!header || !bodyEl) {
      return { empty: true };
    }

    const title = header.querySelector("h1")?.innerText?.trim();
    const cover = header.querySelector(".crayons-article__cover img")?.src || null;
    const meta = header.querySelector(".crayons-article__header__meta");
    const timeEl = header.querySelector("time");

    const links = Array.from(meta?.querySelectorAll("a.crayons-link") || []);
    const authorLink = links.find((a) => {
      const href = a.getAttribute("href") || "";
      return href.startsWith("/") && a.innerText.trim();
    });

    const orgSpan = meta?.querySelector("span");
    const orgLink = orgSpan && orgSpan.innerText.includes("for")
      ? links.find((a) => a !== authorLink && (a.getAttribute("href") || "").startsWith("/"))
      : null;

    const tagEls = Array.from(article.querySelectorAll('a[href^="/t/"]') || []);
    const tags = tagEls
      .map((t) => t.innerText.replace(/^#\s*/, "").trim())
      .filter(Boolean);

    return {
      id: parseInt(bodyEl.dataset.articleId, 10) || null,
      title,
      cover_image: cover,
      published_timestamp: timeEl?.getAttribute("datetime") || null,
      tags,
      body_html: bodyEl.innerHTML.trim(),
      user: authorLink
        ? {
            name: authorLink.innerText.trim(),
            username: authorLink.getAttribute("href").replace(/^\//, ""),
          }
        : null,
      organization: orgLink
        ? {
            name: orgLink.innerText.trim(),
            username: orgLink.getAttribute("href").replace(/^\//, ""),
          }
        : null,
    };
  });

  if (extraction.notFound) {
    throw makeError("NOT_FOUND", "Article not found");
  }

  if (extraction.empty || isBlank(extraction.title) || isBlank(extraction.body_html)) {
    throw makeError("EMPTY_RESULT", "Could not extract article content from the page");
  }

  return extraction;
}

export default async (page, params, cwd) => {
  const { articleUrl, username, slug } = parseArticleUrl(params.url);

  const apiResult = await fetchFromApi(username, slug);

  if (apiResult.ok && apiResult.data) {
    const output = { ...apiResult.data, source: "api" };
    return omitNullFields(output);
  }

  if (apiResult.status === 404) {
    throw makeError("NOT_FOUND", "Article not found");
  }

  // API unavailable (429, 5xx, network failure, parse error) → fallback to browser page extraction.
  const wasRateLimited = apiResult.status === 429;
  let browserData;
  try {
    browserData = await extractFromBrowser(page, articleUrl);
  } catch (browserErr) {
    if (wasRateLimited && browserErr.code === "EMPTY_RESULT") {
      throw makeError("RATE_LIMITED", "Forem API returned 429 and the browser fallback could not retrieve content");
    }
    throw browserErr;
  }

  const output = {
    type_of: "article",
    url: articleUrl,
    path: `/${username}/${slug}`,
    slug,
    ...browserData,
    source: "browser",
  };

  return omitNullFields(output);
};
