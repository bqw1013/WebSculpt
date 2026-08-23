const MAX_LIMIT = 100;
const TABS = new Set(["videos", "feed", "playlists"]);
const SORTS = new Set(["recent", "visited"]);
const API_URL = "https://api.dailymotion.com/user/";
const API_FIELDS =
  "id,screenname,username,avatar_240_url,description,followers_total,following_total," +
  "videos_total,playlists_total,views_total,created_time,country,verified";

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lightHumanize(page, scroll = false) {
  try {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (page.mouse && viewport.width > 0 && viewport.height > 0) {
      await page.mouse.move(
        Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
        Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
        { steps: randomBetween(2, 4) }
      );
      if (scroll && typeof page.mouse.wheel === "function") await page.mouse.wheel(0, randomBetween(80, 180));
    }
  } catch {
    // Pointer nudges are best effort and never block extraction.
  }
}

async function resolveUser(input) {
  const apiUrl = `${API_URL}${encodeURIComponent(input)}?fields=${API_FIELDS}`;
  let resp;
  try {
    resp = await fetch(apiUrl);
  } catch (error) {
    fail("API_ERROR", `Dailymotion user API request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (resp.status === 404) fail("NOT_FOUND", `user "${input}" not found on Dailymotion`);
  if (resp.status < 200 || resp.status >= 300) {
    let detail = "";
    try {
      const json = await resp.json();
      detail = json?.error?.message || "";
    } catch {
      // Non-JSON error body is fine; keep the generic message.
    }
    fail("API_ERROR", `Dailymotion user API HTTP ${resp.status}${detail ? `: ${detail}` : ""}`);
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    fail("API_ERROR", "Dailymotion user API returned invalid JSON");
  }
  if (!data || typeof data !== "object" || !data.username) {
    fail("API_ERROR", "Dailymotion user API response missing username");
  }
  return data;
}

function mapUser(data, username) {
  return {
    id: data.id || null,
    username,
    screenname: data.screenname || username,
    url: `https://www.dailymotion.com/user/${username}`,
    avatar: data.avatar_240_url || null,
    description: data.description || "",
    followerCount: data.followers_total ?? null,
    followingCount: data.following_total ?? null,
    videoCount: data.videos_total ?? null,
    playlistCount: data.playlists_total ?? null,
    viewCount: data.views_total ?? null,
    verified: !!data.verified,
    country: data.country || null,
    createdAt: data.created_time ? new Date(data.created_time * 1000).toISOString() : null
  };
}

function extractVideos(limit) {
  const records = [];
  const seen = new Set();
  const absolute = (href) => {
    try {
      return href ? new URL(href, location.origin).toString() : null;
    } catch {
      return null;
    }
  };
  const thumbOf = (img) => {
    if (!img) return null;
    const src = img.currentSrc || img.src || "";
    return src && !src.startsWith("data:") ? src : null;
  };
  for (const card of document.querySelectorAll('[data-testid="video-card"]')) {
    const videoLink = card.querySelector('a[href^="/video/"]');
    if (!videoLink) continue;
    const id = (videoLink.getAttribute("href") || "").split("/").filter(Boolean).pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const titleEl = card.querySelector('[class*="VideoCard__videoTitle"]');
    const durEl = card.querySelector('[class*="PlayingIndicatorTag__videoDuration"]');
    const pubEl = card.querySelector('[class*="PubDate__videoPubDate"]');
    const img = card.querySelector("img");
    records.push({
      id,
      title: titleEl ? titleEl.getAttribute("title") || titleEl.textContent.trim() || null : videoLink.textContent.trim() || null,
      url: absolute(videoLink.getAttribute("href")),
      duration: durEl ? durEl.textContent.trim() : null,
      thumbnail: thumbOf(img),
      publishedAt: pubEl ? pubEl.getAttribute("title") : null,
      publishedAgo: pubEl ? pubEl.textContent.trim() : null
    });
    if (records.length >= limit) break;
  }
  return records;
}

function extractPlaylists(limit) {
  const records = [];
  const seen = new Set();
  const absolute = (href) => {
    try {
      return href ? new URL(href, location.origin).toString() : null;
    } catch {
      return null;
    }
  };
  const thumbOf = (img) => {
    if (!img) return null;
    const src = img.currentSrc || img.src || "";
    return src && !src.startsWith("data:") ? src : null;
  };
  for (const card of document.querySelectorAll('[data-testid="video-card"]')) {
    const link = card.querySelector('a[href^="/playlist/"]');
    if (!link) continue;
    const id = (link.getAttribute("href") || "").split("/").filter(Boolean).pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const nameEl = card.querySelector('[class*="VideoCard__videoTitle"]');
    const countEl = card.querySelector('[class*="VideoCard__playlistIconContainer"] span');
    const pubEl = card.querySelector('[class*="PubDate__videoPubDate"]');
    const img = card.querySelector("img");
    records.push({
      id,
      name: nameEl ? nameEl.getAttribute("title") || nameEl.textContent.trim() || null : link.textContent.trim() || null,
      url: absolute(link.getAttribute("href")),
      thumbnail: thumbOf(img),
      videoCount: countEl ? parseInt((countEl.textContent || "").replace(/[^\d]/g, ""), 10) || null : null,
      publishedAt: pubEl ? pubEl.getAttribute("title") : null,
      publishedAgo: pubEl ? pubEl.textContent.trim() : null
    });
    if (records.length >= limit) break;
  }
  return records;
}

async function completeThumbnails(page, extractor, limit, tab, items) {
  // Dailymotion lazy-renders card thumbnails only when a card enters the viewport
  // and REMOVES <img> elements for cards scrolled far out of view, so a card's
  // image can only be read while the card is in/near the viewport. Process missing
  // cards from the deepest to the shallowest: centering each one in the viewport
  // loads its image (and every still-missing card around it), then a batch re-
  // extract merges the loaded thumbnails. Existing values are never overwritten,
  // so cards that were already filled are safe. A genuinely thumbnail-less card is
  // left null instead of stalling.
  const missing = items.filter((item) => !item.thumbnail);
  for (let i = missing.length - 1; i >= 0; i -= 1) {
    const target = missing[i];
    if (target.thumbnail) continue;
    await page.evaluate((id) => {
      const cards = [...document.querySelectorAll('[data-testid="video-card"]')];
      for (const card of cards) {
        const a = card.querySelector('a[href^="/video/"], a[href^="/playlist/"]');
        if (a && (a.getAttribute("href") || "").includes(id)) {
          card.scrollIntoView({ block: "center" });
          break;
        }
      }
    }, target.id);
    await page.waitForTimeout(randomBetween(900, 1300));
    const batch = await page.evaluate(extractor, limit);
    const byKey = new Map(items.map((item) => [`${tab}:${item.id}`, item]));
    for (const item of batch) {
      const existing = byKey.get(`${tab}:${item.id}`);
      if (existing && !existing.thumbnail && item.thumbnail) existing.thumbnail = item.thumbnail;
    }
  }
}

async function scrollCollect(page, extractor, limit, tab) {
  const items = [];
  const byKey = new Map();
  const keyFor = (item) => `${tab}:${item.id}`;
  const maxRounds = 40;
  for (let round = 0; round < maxRounds && items.length < limit; round += 1) {
    await lightHumanize(page, true);
    await page.waitForTimeout(randomBetween(300, 600));
    const batch = await page.evaluate(extractor, limit);
    let added = 0;
    for (const item of batch) {
      const key = keyFor(item);
      const existing = byKey.get(key);
      if (existing) {
        // Lazy thumbnails may have resolved since the last pass — backfill them.
        if (!existing.thumbnail && item.thumbnail) existing.thumbnail = item.thumbnail;
        continue;
      }
      if (items.length >= limit) break;
      byKey.set(key, item);
      items.push(item);
      added += 1;
    }
    if (items.length >= limit) break;
    const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await page.waitForTimeout(randomBetween(400, 700));
    const heightAfter = await page.evaluate(() => document.documentElement.scrollHeight);
    if (heightAfter <= heightBefore && added === 0) break;
  }
  return { items, partial: items.length < limit };
}

export default async (page, params, cwd) => {
  const userInput = typeof params.user === "string" ? params.user.trim() : "";
  if (!userInput) fail("MISSING_PARAM", "user is required");
  const tab = String(params.tab).toLowerCase();
  if (!TABS.has(tab)) fail("INVALID_PARAM", `tab must be one of ${[...TABS].join(", ")}`);
  const sort = String(params.sort).toLowerCase();
  if (!SORTS.has(sort)) fail("INVALID_PARAM", `sort must be one of ${[...SORTS].join(", ")}`);
  const rawLimit = String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) {
    fail("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);

  await sleep(randomBetween(200, 700));
  const header = await resolveUser(userInput);
  const username = header.username;

  let path;
  if (tab === "playlists") {
    path = `/user/${username}/playlists`;
  } else if (tab === "feed") {
    path = `/user/${username}`;
  } else {
    path = `/user/${username}/videos`;
  }
  if (sort === "visited" && tab !== "playlists") path += "?sort=visited";
  const url = `https://www.dailymotion.com${path}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await lightHumanize(page);
  await page.waitForSelector('[data-testid="channel-header-testid"]', { timeout: 15000 }).catch(() => {});
  const notFound = await page.evaluate(() => document.title === "Not Found" || !document.querySelector('[data-testid="channel-header-testid"]'));
  if (notFound) fail("NOT_FOUND", `user page not found for "${username}"`);

  await page.waitForSelector('[data-testid="video-card"]', { timeout: 15000 }).catch(() => {});
  const extractor = tab === "playlists" ? extractPlaylists : extractVideos;
  const { items, partial } = await scrollCollect(page, extractor, limit, tab);
  await completeThumbnails(page, extractor, limit, tab, items);

  return {
    user: mapUser(header, username),
    tab,
    sort,
    items,
    partial
  };
};
