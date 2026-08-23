// vimeo/get-user — Vimeo 创作者公开主页头部 + 一个子页列表。
// 路径依据：浏览器页面内 fetch `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1`（node 匿名 401，必须浏览器）
//   - 子页：legacy SSR，DOM 解析 `ol.js-browse_list`，路径式分页 `/{user}/{tab}/page:N/sort:X`

const MAX_LIMIT = 100;

// tab 枚举全值 + 中文对照（manifest 参数描述同步）
// videos      — 作品：创作者上传的视频列表（/videos，每页 12 条，sort date|alphabetical|plays|likes|duration）
// albums      — 专辑：公开页 title 即 "Showcases"（/albums，卡片 /showcase/{id}）
// collections — 合集聚合页：Showcases + Channels 分区，flatten 时每项带 kind:"showcase"|"channel"
// followers   — 粉丝：/following/followers/sort:date，每页 25 条
// following   — 关注：/following
const VALID_TABS = ["videos", "albums", "collections", "followers", "following"];
const TAB_PATH = {
  videos: "/videos",
  albums: "/albums",
  collections: "/collections",
  followers: "/following/followers/sort:date",
  following: "/following"
};

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function randomWait(page, min, max) {
  return page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

async function lightHumanize(page, scroll) {
  try {
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    if (page.mouse && viewport.width > 0 && viewport.height > 0) {
      await page.mouse.move(
        Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
        Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
        { steps: 2 }
      );
      if (scroll) await page.mouse.wheel(0, 100 + Math.floor(Math.random() * 140));
    }
  } catch {
    // Pointer nudges are best effort and never block extraction.
  }
}

// 头像：优先取 >=300px 的尺寸，否则取最大
function pickAvatar(pictures) {
  if (!pictures || !Array.isArray(pictures.sizes) || !pictures.sizes.length) return null;
  const sizes = pictures.sizes.slice().sort((a, b) => (a.width || 0) - (b.width || 0));
  const target = sizes.find((s) => (s.width || 0) >= 300) || sizes[sizes.length - 1];
  return target.link || target.base_link || null;
}

function buildUser(json) {
  const conn = (json.metadata && json.metadata.connections) || {};
  return {
    name: json.name || null,
    url: json.link || null,
    avatar: pickAvatar(json.pictures),
    bio: json.bio || null,
    location: (json.location_details && json.location_details.formatted_address) || "",
    followerCount: conn.followers ? conn.followers.total : null,
    followingCount: conn.following ? conn.following.total : null,
    videoCount: json.metadata && json.metadata.public_videos ? json.metadata.public_videos.total : null,
    albumCount: conn.albums ? conn.albums.total : null,
    collectionCount: json.total_collection_count ?? null,
    memberSince: json.created_time || null,
    verified: Boolean(json.verified),
    website: Array.isArray(json.websites) && json.websites.length ? json.websites[0].url : null,
    membership: json.membership ? json.membership.type : null
  };
}

// 头部 API 匹配：仅用户资料接口带 fetch_user_profile=1，且 path 为 /users/{slug}
function isHeaderResponse(response, slug) {
  const url = response.url();
  return url.includes("api.vimeo.com/users/") && url.includes("fetch_user_profile=1");
}

async function readHeader(page, slug) {
  const waitForResponse = page.waitForResponse((response) => isHeaderResponse(response, slug), { timeout: 30000 });
  const navResponse = await page.goto(`https://vimeo.com/${slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (navResponse && navResponse.status() === 404) fail("NOT_FOUND", `user "${slug}" does not exist`);
  const response = await waitForResponse;
  if (response.status() === 404) fail("NOT_FOUND", `user "${slug}" does not exist`);
  if (!response.ok()) fail("DRIFT_DETECTED", `Vimeo user API HTTP ${response.status()}`);
  const body = await response.json();
  return buildUser(body);
}

// 作品卡：ol.js-browse_list li[id^=clip_]
// 兼容两种卡形态：
//   缩略卡（format:thumbnail）：<a href title=...><img class=thumbnail> .l-ellipsis .meta time
//   详情卡（format:detail）：   <a href><img class=thumbnail> .data .title a + .duration + .meta time
// 默认 /videos 的 format 取决于会话偏好/ cookie，故必须同时兼容。
function readVideos(page) {
  return page.evaluate(() => {
    const items = [];
    for (const li of document.querySelectorAll("ol.js-browse_list li[id^='clip_']")) {
      const a = li.querySelector("a[href]");
      const id = li.id.replace("clip_", "");
      let title = null;
      if (a && a.getAttribute("title")) title = a.getAttribute("title").replace(/\s+/g, " ").trim();
      if (!title) {
        const l = li.querySelector(".l-ellipsis");
        if (l) { const x = l.innerText.replace(/\s+/g, " ").trim(); if (x) title = x; }
      }
      if (!title) {
        const ta = li.querySelector(".data .title a, .title a");
        if (ta) { const x = ta.innerText.replace(/\s+/g, " ").trim(); if (x) title = x; }
      }
      if (!title) {
        const tp = li.querySelector(".data .title, .title");
        if (tp) { const x = tp.innerText.replace(/\s+/g, " ").trim(); if (x) title = x; }
      }
      const timeEl = li.querySelector("time");
      const img = li.querySelector("img.thumbnail, img");
      const rawHref = a ? a.getAttribute("href") : `/${id}`;
      items.push({
        id,
        title,
        url: rawHref.startsWith("http") ? rawHref : `https://vimeo.com${rawHref}`,
        thumbnail: img ? (img.currentSrc || img.src) : null,
        uploadDate: timeEl ? (timeEl.getAttribute("datetime") || timeEl.innerText.trim()) : null
      });
    }
    return items;
  });
}

// 专辑/合集卡：ol.js-browse_list li 中含 /showcase/ 或 /channels/ 链接的项。
// 兼容两种卡形态（format 随会话偏好变化，必须同时兼容）：
//   缩略卡（format:thumbnail）：li.collection_thumbnail -> a[title]/.banner + .overlay .meta
//   详情卡（format:detail）：   普通 li -> .data .title a + .count .videos + .duration
// kind: showcase（专辑，meta "N Videos / M:SS" 总时长）| channel（频道，meta "N Videos / M Followers"）
function readCollectionCards(page) {
  return page.evaluate(() => {
    // 名字候选统一 clean 后再判空，避免空 <a> 的 textContent 空白串阻断后续回退
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const items = [];
    for (const li of document.querySelectorAll("ol.js-browse_list li")) {
      const a = li.querySelector("a[href]");
      if (!a) continue;
      const href = a.getAttribute("href") || "";
      let kind = null;
      if (href.startsWith("/showcase/")) kind = "showcase";
      else if (href.startsWith("/channels/")) kind = "channel";
      if (!kind) continue;

      // name 兼容多种卡形态/嵌套：a[title] → .banner → .data .title a → .data .title
      let name = "";
      if (a && a.getAttribute("title")) name = clean(a.getAttribute("title"));
      if (!name) {
        const banner = li.querySelector(".banner");
        if (banner) name = clean(banner.innerText || banner.textContent);
      }
      if (!name) {
        const titleA = li.querySelector(".data .title a, .title a");
        if (titleA) name = clean(titleA.innerText || titleA.textContent);
      }
      if (!name) {
        const titleP = li.querySelector(".data .title, .title");
        if (titleP) name = clean(titleP.innerText || titleP.textContent);
      }
      name = name || null;

      let metaText = "";
      const overlayMeta = li.querySelector(".overlay .meta, .overlay_thumbnail_meta .meta");
      if (overlayMeta) metaText = overlayMeta.innerText.trim();
      else {
        const count = li.querySelector(".count");
        const duration = li.querySelector(".duration");
        const parts = [];
        if (count) parts.push(count.innerText.trim());
        if (duration) parts.push(duration.innerText.trim());
        metaText = parts.join(" / ");
      }

      const vc = metaText.match(/(\d+)\s*Videos?/i);
      const img = li.querySelector("img");
      items.push({
        kind,
        id: href.split("/").filter(Boolean).pop() || null,
        name,
        url: href.startsWith("http") ? href : `https://vimeo.com${href}`,
        thumbnail: img ? (img.currentSrc || img.src) : null,
        videoCount: vc ? parseInt(vc[1], 10) : null,
        meta: metaText
      });
    }
    return items;
  });
}

// 粉丝/关注用户卡：ol.js-browse_list li[id^=user_]
function readPeople(page) {
  return page.evaluate(() => {
    const items = [];
    for (const li of document.querySelectorAll("ol.js-browse_list li[id^='user_']")) {
      const a = li.querySelector("a[href]");
      const titleEl = li.querySelector(".title");
      const timeEl = li.querySelector("time");
      const img = li.querySelector("img.portrait");
      const rawHref = a ? a.getAttribute("href") : null;
      items.push({
        id: li.id.replace("user_", ""),
        name: (titleEl ? titleEl.innerText : a ? a.getAttribute("title") : "").trim(),
        url: rawHref ? (rawHref.startsWith("http") ? rawHref : `https://vimeo.com${rawHref}`) : null,
        avatar: img ? (img.currentSrc || img.src) : null,
        followedAt: timeEl ? (timeEl.getAttribute("datetime") || timeEl.innerText.trim()) : null
      });
    }
    return items;
  });
}

function readItemsForTab(page, tab) {
  if (tab === "videos") return readVideos(page);
  if (tab === "albums" || tab === "collections") return readCollectionCards(page);
  return readPeople(page); // followers / following
}

// 路径式分页：收集包含 basePath 且含 page:N 的 a[href] -> { page: href }
function readPagination(page, basePath) {
  return page.evaluate((bp) => {
    const map = {};
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (!href.includes(bp)) continue;
      const m = href.match(/page:(\d+)/);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (!(n in map)) map[n] = href;
    }
    return map;
  }, basePath);
}

// 从实际页面 pathname 提取 tab 基路径（剥离 page:/sort:/format: 段，兼容 slug 重定向）
function tabBasePath(pathname) {
  const keep = [];
  for (const seg of pathname.split("/").filter(Boolean)) {
    if (seg.startsWith("page:") || seg.startsWith("sort:") || seg.startsWith("format:")) break;
    keep.push(seg);
  }
  return "/" + keep.join("/");
}

function normalizeHref(href) {
  if (href.startsWith("http")) return href.replace(/^https?:\/\/vimeo\.com/, "");
  return href;
}

async function readTabPage(page, slug, tab, limit) {
  const items = [];
  const seen = new Set();
  const visited = new Set();
  let currentPath = `/${slug}${TAB_PATH[tab]}`;
  let currentPage = 1;
  let basePath = null;

  while (items.length < limit) {
    await page.goto(`https://vimeo.com${currentPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomWait(page, 240, 560);
    await lightHumanize(page, true);
    if (!basePath) basePath = tabBasePath(new URL(page.url()).pathname);

    const parsed = await readItemsForTab(page, tab);
    for (const item of parsed) {
      const key = `${tab}:${item.id || item.url}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
    if (items.length >= limit) break;
    visited.add(currentPage);

    const pagination = await readPagination(page, basePath);
    let next = null;
    for (const raw of Object.keys(pagination)) {
      const n = parseInt(raw, 10);
      if (n > currentPage && !visited.has(n) && (next === null || n < next)) next = n;
    }
    if (next === null) break;
    currentPage = next;
    currentPath = normalizeHref(pagination[next]);
  }

  return { items: items.slice(0, limit), partial: items.length < limit };
}

export default async (page, params, cwd) => {
  const user = typeof params.user === "string" ? params.user.trim() : "";
  if (!user) fail("MISSING_PARAM", "user is required");
  // slug 只允许 URL 安全字符（字母数字 . _ -），不含 / 或空格
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(user)) fail("INVALID_PARAM", `user slug "${user}" contains invalid characters`);

  const rawTab = String(params.tab).toLowerCase();
  if (!VALID_TABS.includes(rawTab)) fail("INVALID_PARAM", `tab must be one of ${VALID_TABS.join(", ")}`);
  const tab = rawTab;

  // 数字参数：先正则校验原始串再转换，禁止 parseInt 截断
  const rawLimit = String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

  const header = await readHeader(page, user);
  const tabResult = await readTabPage(page, user, tab, limit);

  return {
    user: header,
    tab,
    maxLimit: MAX_LIMIT,
    resultCount: tabResult.items.length,
    items: tabResult.items,
    partial: tabResult.partial,
    source: "api+dom"
  };
};
