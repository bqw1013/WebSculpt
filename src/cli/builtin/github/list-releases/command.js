// github/list-releases — browser runtime
//
// Reads the SSR releases page https://github.com/{owner}/{repo}/releases,
// extracts release sections directly from the server-rendered DOM, paginates
// via ?page=N when limit > 10, and loads each release's assets from the
// same-origin /releases/expanded_assets/{tag} endpoint (fetched inside the
// page so the request reuses the browser session/cookies).

function parseRepo(raw) {
  if (!raw || typeof raw !== "string") {
    const err = new Error('[INVALID_PARAM] repo is required: "owner/repo" or a github.com URL');
    err.code = "INVALID_PARAM";
    throw err;
  }
  const urlMatch = raw.match(/github\.com\/([^/\s?#]+)\/([^/\s?#]+)/);
  let owner = null;
  let repo = null;
  if (urlMatch) {
    owner = urlMatch[1];
    repo = urlMatch[2];
  } else if (/^[^/\s?#]+\/[^/\s?#]+$/.test(raw.trim())) {
    const parts = raw.trim().split("/");
    owner = parts[0];
    repo = parts[1];
  }
  if (!owner || !repo) {
    const err = new Error(
      '[INVALID_PARAM] repo must be "owner/repo" (e.g. facebook/react) or a github.com URL'
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  return `${owner}/${repo}`;
}

function parseLimit(raw) {
  const str = String(raw == null ? "" : raw).trim();
  if (!/^\d+$/.test(str)) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const n = parseInt(str, 10);
  if (n < 1 || n > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  return n;
}

function randomWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs in the browser: returns "NOT_FOUND", "EMPTY_RESULT", or null.
function makeDetectStateFn() {
  return () => {
    const title = document.title || "";
    const bodyText = (document.body && document.body.textContent) || "";
    if (title.indexOf("Page not found") !== -1 || bodyText.indexOf("Page not found") !== -1) {
      return "NOT_FOUND";
    }
    // Empty state heading is "There aren't any releases here". GitHub renders a
    // curly apostrophe (U+2019) in "aren't", so tolerate both straight/curly.
    if (/aren['’]t any releases here/i.test(bodyText)) {
      return "EMPTY_RESULT";
    }
    // Scoped fallback: only a blankslate whose heading mentions releases is the
    // empty state (other blankslates, e.g. filter/search empty, are unrelated).
    const bs = document.querySelector(".blankslate");
    const bsH2 = bs ? bs.querySelector("h2") : null;
    if (bsH2 && /\breleases here\b/i.test(bsH2.textContent || "")) {
      return "EMPTY_RESULT";
    }
    return null;
  };
}

// Runs in the browser: extracts release core fields from SSR DOM sections.
function makeExtractReleasesFn() {
  return () => {
    const sections = Array.from(document.querySelectorAll('section[id^="release-"]'));
    return sections.map((sec) => {
      const id = sec.id || "";
      const tag_name = id.indexOf("release-") === 0 ? id.slice("release-".length) : null;
      const h2 = sec.querySelector("h2.sr-only");
      const name = h2 ? (h2.textContent || "").replace(/\s+/g, " ").trim() : null;
      const labels = Array.from(sec.querySelectorAll(".Label")).map((l) =>
        (l.textContent || "").trim()
      );
      const prerelease = labels.indexOf("Pre-release") !== -1;
      const draft = labels.indexOf("Draft") !== -1;
      const rt = sec.querySelector("relative-time[datetime]");
      const published_at = rt ? rt.getAttribute("datetime") : null;
      const bodyEl = sec.querySelector(
        '[data-test-selector="body-content"], .markdown-body'
      );
      const body = bodyEl ? (bodyEl.textContent || "").replace(/\s+/g, " ").trim() : null;
      const tagLink = sec.querySelector('a[href*="/releases/tag/"]');
      const html_url = tagLink
        ? "https://github.com" + tagLink.getAttribute("href")
        : null;
      const frag = sec.querySelector('include-fragment[src*="expanded_assets"]');
      const expandedAssetsUrl = frag ? frag.getAttribute("src") : null;
      const counter = sec.querySelector("span.Counter");
      let assetCount = 0;
      if (counter) {
        const title = counter.getAttribute("title") || "";
        assetCount = parseInt(title, 10);
        if (Number.isNaN(assetCount)) {
          assetCount = parseInt((counter.textContent || "").trim(), 10) || 0;
        }
      }
      return {
        tag_name,
        name,
        draft,
        prerelease,
        published_at,
        body,
        html_url,
        expandedAssetsUrl,
        assetCount,
      };
    });
  };
}

// Runs in the browser: fetches a list of expanded_assets URLs (same-origin,
// reuses session) and parses each into { name, size, download_url } assets.
function makeFetchAssetsFn() {
  return async (urls) => {
    const parseAssets = (html) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      const rows = Array.from(container.querySelectorAll("li.Box-row"));
      return rows.map((row) => {
        const a = row.querySelector("a[href]");
        const text = (row.textContent || "").replace(/\s+/g, " ").trim();
        const sizeMatch = text.match(/([\d.]+)\s?(KB|MB|GB|B)\b/);
        const href = a ? a.getAttribute("href") : null;
        return {
          name: a ? (a.textContent || "").replace(/\s+/g, " ").trim() : null,
          size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null,
          download_url: href
            ? href.indexOf("http") === 0
              ? href
              : "https://github.com" + href
            : null,
        };
      });
    };
    const results = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const chunk = urls.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (url) => {
          try {
            const resp = await fetch(url, { headers: { Accept: "text/html" } });
            const html = await resp.text();
            return { url, assets: parseAssets(html) };
          } catch (e) {
            return { url, assets: [], error: String(e) };
          }
        })
      );
      results.push(...chunkResults);
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 250));
    }
    return results;
  };
}

export default async (page, params, cwd) => {
  const repo = parseRepo(params.repo);
  const limit = parseLimit(params.limit);

  const [owner, repoName] = repo.split("/");
  const baseUrl = `https://github.com/${owner}/${repoName}/releases`;
  const pagesNeeded = Math.ceil(limit / 10);

  const detectState = makeDetectStateFn();
  const extractReleases = makeExtractReleasesFn();
  const fetchAssetsFn = makeFetchAssetsFn();

  const collected = [];

  for (let p = 1; p <= pagesNeeded; p++) {
    const url = p === 1 ? baseUrl : `${baseUrl}?page=${p}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (e) {
      const err = new Error("[NETWORK_ERROR] Failed to load " + url + ": " + e.message);
      err.code = "NETWORK_ERROR";
      throw err;
    }

    // Human-like random wait, scroll and mouse move (polite pacing, kept light).
    await randomWait(180 + Math.floor(Math.random() * 320));
    await page
      .evaluate(() => window.scrollTo(0, Math.floor(Math.random() * 400)))
      .catch(() => {});
    await page
      .mouse
      .move(100 + Math.floor(Math.random() * 400), 100 + Math.floor(Math.random() * 300))
      .catch(() => {});

    if (p === 1) {
      const state = await page.evaluate(detectState);
      if (state === "NOT_FOUND") {
        const err = new Error("[NOT_FOUND] Repository not found: " + repo);
        err.code = "NOT_FOUND";
        throw err;
      }
      if (state === "EMPTY_RESULT") {
        const err = new Error("[EMPTY_RESULT] No releases found for repository: " + repo);
        err.code = "EMPTY_RESULT";
        throw err;
      }
    }

    let sections;
    try {
      await page.waitForSelector('section[id^="release-"]', { timeout: 10000 });
      sections = await page.evaluate(extractReleases);
    } catch (e) {
      sections = [];
    }

    if (sections.length === 0) {
      break;
    }

    collected.push(...sections);
    if (sections.length < 10 || collected.length >= limit) {
      break;
    }

    if (p < pagesNeeded) {
      await randomWait(250 + Math.floor(Math.random() * 450));
    }
  }

  const releases = collected.slice(0, limit);
  const partial = releases.length < limit;

  // The expanded_assets URL is deterministic from tag_name. We build it
  // directly because the first/latest release's <include-fragment> can load and
  // replace itself in the DOM before extraction, making the DOM src unavailable.
  const assetUrls = releases.map((r) => {
    if (r.tag_name) {
      return `https://github.com/${owner}/${repoName}/releases/expanded_assets/${encodeURIComponent(r.tag_name)}`;
    }
    return r.expandedAssetsUrl || null;
  }).filter(Boolean);
  const assetMap = {};
  if (assetUrls.length > 0) {
    const results = await page.evaluate(fetchAssetsFn, assetUrls);
    for (const r of results) {
      assetMap[r.url] = r.assets || [];
    }
  }

  const cleaned = releases.map((r) => {
    let assetsUrl = null;
    if (r.tag_name) {
      assetsUrl = `https://github.com/${owner}/${repoName}/releases/expanded_assets/${encodeURIComponent(r.tag_name)}`;
    } else {
      assetsUrl = r.expandedAssetsUrl || null;
    }
    const assets = assetsUrl ? assetMap[assetsUrl] : [];
    return {
      tag_name: r.tag_name,
      name: r.name,
      draft: r.draft,
      prerelease: r.prerelease,
      published_at: r.published_at,
      body: r.body,
      html_url: r.html_url,
      assets: assets || [],
    };
  });

  return { repo, count: cleaned.length, partial, releases: cleaned };
};
