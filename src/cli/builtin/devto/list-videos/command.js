import fs from "fs";

const MAX_LIMIT = 1000;
const API_BASE = "https://dev.to/api/videos";
const BROWSER_URL = "https://dev.to/videos";

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

async function fetchApiVideos(limit) {
  const url = `${API_BASE}?per_page=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 429) {
    throwError("RATE_LIMITED", "API rate limited");
  }
  if (res.status === 404) {
    throwError("NOT_FOUND", "API endpoint not found");
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

function normalizeApiVideo(raw) {
  return omitNullish({
    id: raw.id,
    title: raw.title,
    path: raw.path,
    url: raw.path ? `https://dev.to${raw.path}` : undefined,
    video: raw.video,
    video_source_url: raw.video_source_url,
    user_id: raw.user_id,
    user: raw.user?.name ? { name: raw.user.name } : undefined,
  });
}

async function extractWithApi(limit) {
  const data = await fetchApiVideos(limit);

  if (!Array.isArray(data)) {
    throwError("NETWORK_ERROR", "API returned unexpected data shape");
  }

  if (data.length === 0) {
    return { source: "api", videos: [] };
  }

  return {
    source: "api",
    videos: data.map(normalizeApiVideo),
  };
}

async function applyNaturalInteraction(page) {
  await page.evaluate(() => {
    const dy = 200 + Math.floor(Math.random() * 200);
    window.scrollBy(0, dy);
  });
  const delay = 500 + Math.floor(Math.random() * 800);
  await new Promise((r) => setTimeout(r, delay));
}

async function extractWithBrowser(page, limit) {
  await page.goto(BROWSER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
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
    throwError("NOT_FOUND", "Videos page not found");
  }

  const rawVideos = await page.evaluate((max) => {
    const cards = Array.from(document.querySelectorAll("a.crayons-card.media-card")).slice(0, max);
    return cards.map((card) => {
      const titleEl = card.querySelector(".media-card__content h2.fs-base.mb-2.fw-medium");
      const authorEl = card.querySelector(".media-card__content small.fs-s");
      const iframe = card.querySelector("iframe");
      const idMatch = card.id?.match(/video-article-(\d+)/);

      return {
        id: idMatch ? parseInt(idMatch[1], 10) : null,
        title: titleEl?.innerText?.trim(),
        author: authorEl?.innerText?.trim(),
        path: card.getAttribute("href"),
        video: iframe?.getAttribute("src"),
      };
    });
  }, limit);

  const videos = rawVideos
    .filter((raw) => raw.title && raw.path)
    .map((raw) =>
      omitNullish({
        id: raw.id,
        title: raw.title,
        path: raw.path,
        url: raw.path ? `https://dev.to${raw.path}` : undefined,
        video: raw.video,
        user: raw.author ? { name: raw.author } : undefined,
      })
    );

  return { source: "browser", videos };
}

export default async (page, params, cwd) => {
  const limitRaw = parseInt(params.limit, 10);

  if (Number.isNaN(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIMIT) {
    throwError("INVALID_PARAM", `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const limit = limitRaw;

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

    const result = await extractWithApi(limit);
    if (result.videos.length === 0) {
      throwError("EMPTY_RESULT", "No videos found");
    }
    return result;
  } catch (err) {
    if (err.code === "EMPTY_RESULT" || err.code === "INVALID_PARAM") throw err;
    apiError = err;
  }

  let browserResult;
  try {
    browserResult = await extractWithBrowser(page, limit);
  } catch (err) {
    if (err.code === "NOT_FOUND" || err.code === "INVALID_PARAM") throw err;
    if (err.message && err.message.includes("BROWSER_ATTACH_REQUIRED")) {
      throwError("BROWSER_ATTACH_REQUIRED", "Chrome remote debugging is not available");
    }
    throwError("NETWORK_ERROR", `API and browser fallback both failed: ${apiError?.message}; ${err.message}`);
  }

  if (browserResult.videos.length === 0) {
    throwError("EMPTY_RESULT", "No videos found");
  }

  return browserResult;
};
