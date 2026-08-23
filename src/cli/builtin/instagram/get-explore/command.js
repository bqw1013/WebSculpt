const MAX_LIMIT = 100;
const API_BASE =
  "https://www.instagram.com/api/v1/discover/web/explore_grid/?include_fixed_destinations=true&is_nonpersonalized_explore=false&is_prefetch=false&module=explore_popular&omit_cover_media=false";
const IG_APP_ID = "936619743392459";
const MAX_PAGES = 12;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function classifyType(media) {
  if (Array.isArray(media.carousel_media) && media.carousel_media.length) return "carousel";
  if (Array.isArray(media.video_versions) && media.video_versions.length) return "video";
  return "image";
}

// Recursively walk sectional_items to collect every media object that has a `.code`.
// Page 1 nests media in layout_content.fill_items[].media (one_by_two layouts),
// pages 2+ expose them directly in layout_content.medias[] (dynamic_grid).
function collectMedia(payload) {
  const medias = [];
  const walk = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.media && typeof value.media === "object" && value.media.code) {
      medias.push(value.media);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else {
      for (const key of Object.keys(value)) walk(value[key]);
    }
  };
  walk(payload && payload.sectional_items);
  return medias;
}

function toRecord(media) {
  const candidates = media.image_versions2 && media.image_versions2.candidates;
  const thumbnail = Array.isArray(candidates) && candidates[0] && candidates[0].url
    ? candidates[0].url
    : null;
  return {
    shortcode: media.code || null,
    url: media.code ? `https://www.instagram.com/p/${media.code}/` : null,
    type: classifyType(media),
    thumbnail,
    likeCount: typeof media.like_count === "number" ? media.like_count : null,
    commentCount: typeof media.comment_count === "number" ? media.comment_count : null
  };
}

async function waitRandom(page, min, max) {
  await page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

async function fallbackDom(page, limit) {
  const records = await page.evaluate(({ max }) => {
    const out = [];
    const seen = new Set();
    const abs = (href) => {
      try {
        return new URL(href, location.origin).toString();
      } catch {
        return null;
      }
    };
    for (const link of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
      const href = abs(link.getAttribute("href"));
      const match = href && href.match(/\/(?:p|reel)\/([^/?#]+)/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      const img = link.querySelector("img");
      out.push({
        shortcode: match[1],
        url: href.split("?")[0],
        type: null,
        thumbnail: img && img.src ? img.src : null,
        likeCount: null,
        commentCount: null
      });
      if (out.length >= max) break;
    }
    return out;
  }, { max: limit });
  if (!records.length) return null;
  return {
    results: records.slice(0, limit),
    resultCount: Math.min(records.length, limit),
    maxLimit: MAX_LIMIT,
    source: "dom",
    pagesFetched: 0,
    partial: true
  };
}

export default async (page, params, cwd) => {
  const rawLimit = String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer (1-100)");
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

  // Establish session context: logged-in cookies + same-origin for the in-page API call.
  await page.goto("https://www.instagram.com/explore/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});

  const records = [];
  const seen = new Set();
  const cursors = new Set();
  let cursor = null;
  let more = true;
  let pagesFetched = 0;
  let apiFailure = null;

  try {
    while (records.length < limit && more && pagesFetched < MAX_PAGES) {
      const apiUrl = API_BASE + (cursor ? "&max_id=" + encodeURIComponent(cursor) : "");
      const result = await page.evaluate(
        async ({ url, igAppId }) => {
          const resp = await fetch(url, {
            credentials: "include",
            headers: {
              "x-ig-app-id": igAppId,
              "x-requested-with": "XMLHttpRequest"
            }
          });
          if (!resp.ok) return { ok: false, status: resp.status };
          return { ok: true, data: await resp.json() };
        },
        { url: apiUrl, igAppId: IG_APP_ID }
      );

      if (!result.ok) {
        if (result.status === 403) {
          fail("AUTH_REQUIRED", "Instagram requires a logged-in session or blocked the request");
        }
        apiFailure = `explore_grid API returned HTTP ${result.status}`;
        break;
      }

      const payload = result.data;
      if (!payload || payload.status !== "ok" || !Array.isArray(payload.sectional_items)) {
        apiFailure = "explore_grid API response structure changed";
        break;
      }

      more = !!payload.more_available;
      const nextCursor = payload.max_id || null;
      if (nextCursor && cursors.has(nextCursor)) break; // cursor loop guard
      if (nextCursor) cursors.add(nextCursor);
      cursor = nextCursor;
      pagesFetched += 1;

      for (const media of collectMedia(payload)) {
        const code = media && media.code;
        if (!code || seen.has(code)) continue;
        seen.add(code);
        records.push(toRecord(media));
        if (records.length >= limit) break;
      }

      if (records.length < limit) await waitRandom(page, 1500, 2500);
    }
  } catch (error) {
    if (error && error.code) throw error; // business errors propagate (INVALID_PARAM etc.)
    apiFailure = error instanceof Error ? error.message : String(error);
  }

  if (records.length === 0) {
    const domOutput = await fallbackDom(page, limit);
    if (domOutput) return domOutput;
    if (apiFailure) fail("DRIFT_DETECTED", `Instagram explore_grid API and DOM extraction failed: ${apiFailure}`);
    fail("EMPTY_RESULT", "No explore grid items returned");
  }

  return {
    results: records.slice(0, limit),
    resultCount: Math.min(records.length, limit),
    maxLimit: MAX_LIMIT,
    source: "api",
    pagesFetched,
    partial: records.length < limit
  };
};
