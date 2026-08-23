// facebook/get-page: fetch a Facebook public Page's posts timeline or sub-pages.
// Stable anchors only: ARIA roles (article/tablist/tab/link/img), data-ad-preview,
// a[href*="/followers"], and URL path structure. No class names.
// Tab → path mapping (path-based, unlike personal profiles which use sk=):
//   posts     → /{page}/            (default landing)
//   about     → /{page}/about
//   photos    → /{page}/photos
//   reels     → /{page}/reels_tab   (auto-redirects to /{page}/reels/)
//   followers → /{page}/followers

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function integerLimit(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) fail("INVALID_PARAM", "limit must be a positive integer");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) fail("INVALID_PARAM", "limit must be at least 1");
  if (n > 100) fail("LIMIT_EXCEEDED", "limit must be at most 100");
  return n;
}

function waitRandom(min, max) {
  const ms = Math.floor(min + Math.random() * (max - min + 1));
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TABS = ["posts", "about", "photos", "reels", "followers"];

// ---------------------------------------------------------------------------
// Page-context extractors. Each is self-contained (runs inside the browser).
// ---------------------------------------------------------------------------

function extractPosts() {
  const isPostLink = h => /\/posts\/|permalink\.php|\/watch\/\?v=|\/reel\/|\/videos\//.test(h || "");
  const cleanUrl = u => {
    const [path, q] = u.split("?");
    if (!q) return u.replace(/\/$/, "");
    const keep = q.split("&").filter(p => !p.startsWith("__") && p !== "s=ifu");
    const c = keep.length ? path + "?" + keep.join("&") : path;
    return c.replace(/\/$/, "");
  };
  const isTopLevel = a => {
    let p = a.parentElement;
    while (p) {
      if (p.getAttribute && p.getAttribute("role") === "article") return false;
      p = p.parentElement;
    }
    return true;
  };
  const num = el => {
    if (!el) return null;
    const m = (el.innerText || "").trim().match(/^([\d.,]+)\s*(万|千|K|M)?$/);
    return m ? m[1] + (m[2] || "") : null;
  };
  const insideArticle = el => {
    let p = el.parentElement;
    while (p) {
      if (p.getAttribute && p.getAttribute("role") === "article") return true;
      p = p.parentElement;
    }
    return false;
  };

  const articles = Array.from(document.querySelectorAll('div[role="article"]')).filter(isTopLevel);
  const posts = [];

  for (const a of articles) {
    const permLink = Array.from(a.querySelectorAll("a")).find(x => isPostLink(x.getAttribute("href") || ""));
    if (!permLink) continue;

    let author = null;
    const authorCands = Array.from(a.querySelectorAll("a")).filter(x => {
      const h = (x.getAttribute("href") || "").split("?")[0];
      const t = (x.innerText || "").trim();
      if (!t || t.length > 60) return false;
      if (
        isPostLink(h) || h.includes("/photo") || h.includes("/stories") ||
        h.includes("/groups") || h.includes("/reel") || h.includes("/watch") ||
        h.includes("/videos") || h.includes("/login") || h.includes("/help") ||
        h.includes("/policy") || h.includes("hashtag") || h === "/" || h === "#"
      ) return false;
      return (
        /facebook\.com\/[^/]+$/.test(h) ||
        /facebook\.com\/profile\.php\?id=/.test(h) ||
        /^\/[^/]+\/?$/.test(h) ||
        /^\/profile\.php\?id=/.test(h)
      );
    });
    if (authorCands.length) {
      const au = authorCands[0].getAttribute("href") || "";
      const urlPath = au.split("?")[0];
      const url = au.includes("profile.php?id=") ? urlPath + "?" + au.split("?")[1].split("&")[0] : urlPath;
      author = { name: authorCands[0].innerText.trim(), url };
    }

    const msgEl = a.querySelector('[data-ad-preview="message"]');
    let text = msgEl ? msgEl.innerText.trim() : null;
    if (text) text = text.replace(/…\s*(展开|See more|More|继续阅读)\s*$/, "").trim() || null;

    // Fallback for photo/event posts without data-ad-preview: the longest
    // non-comment div[dir="auto"] leaf inside the article body.
    if (!text) {
      const dirAutos = Array.from(a.querySelectorAll('div[dir="auto"]')).filter(e => !insideArticle(e) && e.textContent.trim().length > 1);
      if (dirAutos.length) {
        const cand = dirAutos.map(e => e.textContent.trim()).sort((x, y) => y.length - x.length)[0];
        if (cand) text = cand.replace(/…\s*(展开|See more|More|继续阅读)\s*$/, "").trim() || null;
      }
    }

    const time = permLink.getAttribute("aria-label") || permLink.innerText.trim();

    const media = [];
    Array.from(a.querySelectorAll('a[href*="/photo/"] img')).forEach(img => {
      const srcset = img.getAttribute("srcset");
      const url = srcset ? srcset.split(",")[0].trim().split(" ")[0] : (img.getAttribute("src") || "");
      if (url.startsWith("http")) media.push({ type: "photo", url });
    });
    Array.from(a.querySelectorAll("video")).forEach(v => {
      if (v.getAttribute("poster")) media.push({ type: "video", url: v.getAttribute("poster") });
    });

    if (!author && !text && media.length === 0) continue;

    const statBtns = Array.from(a.querySelectorAll('[role="button"]')).filter(x => {
      const t = (x.innerText || "").trim();
      return /^[\d.,]+\s*(万|千|K|M)?$/.test(t) && t.length < 12;
    });

    posts.push({
      author,
      text,
      permalink: cleanUrl(permLink.getAttribute("href") || ""),
      time,
      media,
      stats: { likes: num(statBtns[0]), comments: num(statBtns[1]), shares: num(statBtns[2]) }
    });
  }

  const endMsg = document.body.innerText.match(/(已全部看完|You.?re all caught up)/i);
  return {
    items: posts,
    endMsg: endMsg ? endMsg[0] : null,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0
  };
}

function extractAbout() {
  const norm = t => {
    const m = t.match(/^([\d.,]+\s*[亿万千KkMm]?)/);
    return m ? m[1].replace(/\s+/g, "") : t;
  };
  const main = document.querySelector('[role="main"]');
  const mainText = main ? main.innerText : "";

  // name: the page avatar's aria-label (exclude the left-nav personal avatar).
  let name = null;
  for (const el of document.querySelectorAll('[role="img"]')) {
    const label = (el.getAttribute("aria-label") || "").trim();
    if (label && !/你的个人主页|your profile/i.test(label)) { name = label; break; }
  }

  // followers: the header link is a stable anchor.
  const folLink = document.querySelector('a[href*="/followers"]');
  const followersRaw = folLink ? folLink.innerText.trim() : null;
  const followers = followersRaw ? norm(followersRaw) : null;
  const followersUrl = folLink ? (folLink.href || "").split("?")[0] : null;

  // verified: verified pages show a badge svg with title/aria-label.
  let verified = /已认证账户|已认证|已验证/.test(mainText);
  if (!verified) {
    for (const s of document.querySelectorAll('svg[title]')) {
      if (/已认证|verified/i.test(s.getAttribute("title") || "")) { verified = true; break; }
    }
  }
  if (!verified) {
    for (const el of document.querySelectorAll('[aria-label]')) {
      if (/已认证|verified/i.test(el.getAttribute("aria-label") || "")) { verified = true; break; }
    }
  }

  // description + category: the overview card is the first ancestor of the
  // follower link whose innerText is large enough to hold a sentence. Within it
  // the description is the longest clean text element (≥30 chars, contains a
  // space, no button/follower/location noise) and the category is the short
  // text right after it.
  const noise = /关注|搜索|详细了解|发消息|位粉丝|粉丝|展开|查看全部|点评|条点评/;
  const ignore = /^(发消息|关注|搜索|详细了解|已关注|查看全部|全部|简介|Reels|照片|粉丝|展开|链接|联系方式|详细信息|类别|个人资料|隐私和法律信息|创建者|加入主页|发送消息|条点评)$/;
  let description = null;
  let category = null;
  let card = folLink;
  let descLeaf = null;
  for (let i = 0; i < 15 && card; i++) {
    const inner = (card.innerText || "").trim();
    if (inner.length >= 50) {
      const cands = Array.from(card.querySelectorAll("div,span"))
        .filter(e => {
          const t = (e.innerText || "").trim();
          return t.length >= 30 && t.length <= 600 && t.includes(" ") && !noise.test(t);
        })
        .sort((a, b) => b.innerText.trim().length - a.innerText.trim().length);
      if (cands.length) { descLeaf = cands[0]; break; }
    }
    card = card.parentElement;
  }
  if (card && descLeaf) {
    description = descLeaf.innerText.trim();
    const els = Array.from(card.querySelectorAll("div,span"));
    const descIdx = els.indexOf(descLeaf);
    for (let i = descIdx + 1; i < els.length; i++) {
      const t = els[i].textContent.trim();
      if (t.length >= 2 && t.length <= 20 && !ignore.test(t) && !t.includes("粉丝") && !/[\d,]/.test(t)) {
        category = t;
        break;
      }
    }
  }

  return { name, followers, followersUrl, description, category, verified };
}

function extractPhotos() {
  const items = [];
  const seen = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/(?:photo\.php\?fbid=|photo\/\?fbid=)(\d+)/);
    if (!m) continue;
    const img = a.querySelector("img");
    if (!img) continue;
    const srcset = img.getAttribute("srcset");
    const imageUrl = srcset ? srcset.split(",")[0].trim().split(" ")[0] : (img.getAttribute("src") || "");
    if (!imageUrl.startsWith("http")) continue;
    const query = href.split("?")[1] || "";
    const cleanQuery = query.split("&").filter(p => !p.startsWith("__")).join("&");
    const url = href.split("?")[0] + "?" + cleanQuery;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ url, imageUrl });
  }
  return { items, scrollY: window.scrollY || 0, scrollHeight: document.documentElement.scrollHeight || 0 };
}

function extractReels() {
  const items = [];
  const seen = new Set();
  for (const a of document.querySelectorAll("a[href*='/reel/']")) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\/reel\/(\d+)\/?/);
    if (!m) continue;
    const url = "https://www.facebook.com/reel/" + m[1] + "/";
    if (seen.has(url)) continue;
    const img = a.querySelector("img");
    let imageUrl = null;
    if (img) {
      const srcset = img.getAttribute("srcset");
      imageUrl = srcset ? srcset.split(",")[0].trim().split(" ")[0] : (img.getAttribute("src") || "");
      if (!imageUrl.startsWith("http")) imageUrl = null;
    }
    let views = null;
    let card = a;
    for (let i = 0; i < 4 && card; i++) {
      const t = card.innerText.trim().replace(/\s+/g, " ");
      if (t) {
        const vm = t.match(/^[\d.,]+\s*[亿万千KkMm]?/);
        if (vm) { views = vm[0].trim(); break; }
      }
      card = card.parentElement;
    }
    seen.add(url);
    items.push({ url, imageUrl, views });
  }
  return { items, scrollY: window.scrollY || 0, scrollHeight: document.documentElement.scrollHeight || 0 };
}

function extractFollowers() {
  const main = document.querySelector('[role="main"]');
  const items = [];
  const seen = new Set();
  if (!main) return { items, scrollY: 0, scrollHeight: 0 };
  // A follower card is a profile link that carries an avatar image within its
  // containing card (the avatar is often in a sibling link/wrapper). Header
  // buttons and external redirect links (l.facebook.com) are filtered out by
  // the URL checks + avatar requirement.
  const hasAvatar = a => {
    let cur = a;
    for (let i = 0; i < 6 && cur; i++) {
      const img = cur.querySelector("img");
      if (img) {
        const src = img.getAttribute("src") || "";
        if (src.includes("scontent") || src.includes("static.xx.fbcdn")) return true;
      }
      if (!cur.parentElement) break;
      cur = cur.parentElement;
    }
    return false;
  };
  for (const a of main.querySelectorAll("a[href]")) {
    const href = (a.getAttribute("href") || "").replace(/^\/\//, "https://");
    const h = href.split("?")[0];
    if (!/^https:\/\/www\.facebook\.com\//.test(h)) continue;
    const isProfile = /profile\.php\?id=\d+/.test(href);
    const path = h.replace("https://www.facebook.com/", "");
    const isVanity = /^[A-Za-z0-9.\-]+$/.test(path) &&
      !/^(followers|following|photos|reels|about|search|login|help|policy|hashtag|events|groups|directory|me|messages|settings)/.test(path);
    if (!isProfile && !isVanity) continue;
    const fullText = a.innerText.trim().replace(/\s+/g, " ");
    if (!fullText || fullText.length > 60) continue;
    if (!hasAvatar(a)) continue;
    let name = fullText;
    const span = a.querySelector("span");
    if (span && span.innerText.trim()) name = span.innerText.trim();
    let descriptor = null;
    const rest = fullText.replace(name, "").trim();
    if (rest && rest.length < 60 && !/^(已关注|关注)$/.test(rest)) descriptor = rest;
    let url = h;
    if (isProfile) {
      const q = (href.split("?")[1] || "").split("&")[0];
      url = h + "?" + q;
    }
    const key = name + "|" + url;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = { name, url };
    if (descriptor) item.descriptor = descriptor;
    items.push(item);
  }
  return { items, scrollY: window.scrollY || 0, scrollHeight: document.documentElement.scrollHeight || 0 };
}

// ---------------------------------------------------------------------------
// Shared scroll-and-collect loop (runs in the Node/daemon context).
// ---------------------------------------------------------------------------

async function collect(page, extractor, keyFn, limit, endSignalName) {
  const seen = new Set();
  const items = [];
  const add = list => {
    for (const it of list) {
      const k = keyFn(it);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
      if (items.length >= limit) break;
    }
  };

  let state = await page.evaluate(extractor);
  add(state.items);
  let done = endSignalName && state[endSignalName] ? true : false;
  let attempts = 0;
  let stale = 0;
  let emptyRounds = 0;
  let lastY = state.scrollY || 0;
  const MAX_ATTEMPTS = 45;

  while (items.length < limit && !done && attempts < MAX_ATTEMPTS) {
    const before = items.length;
    await page.mouse.move(100 + Math.floor(Math.random() * 1000), 200 + Math.floor(Math.random() * 500));
    await page.mouse.wheel(0, 600 + Math.floor(Math.random() * 500));
    await page.evaluate(() => window.scrollBy(0, 800 + Math.floor(Math.random() * 500)));
    await waitRandom(800, 1500);
    attempts += 1;
    state = await page.evaluate(extractor);
    add(state.items);
    if (endSignalName && state[endSignalName]) done = true;
    const y = state.scrollY || 0;
    if (items.length === before) {
      // Empty lists (e.g. a followers page showing no cards) must not keep
      // scrolling: stop after a few rounds that yielded nothing at all.
      if (items.length === 0) emptyRounds += 1;
      if (y > lastY) stale = 0;
      else stale += 1;
      if (items.length === 0 && emptyRounds >= 4) done = true;
      if (items.length > 0 && stale >= 5) done = true;
    } else {
      emptyRounds = 0;
      stale = 0;
    }
    lastY = y;
  }

  return { items: items.slice(0, limit), partial: items.length < limit };
}

const ERROR_SIGNALS = () => ({
  auth: /log into facebook|登录 facebook|sign up for facebook|注册 facebook/i,
  block: /temporarily locked|checkpoint|确认你的身份|security check|account has been/i,
  notfound: /内容暂时无法显示|暂时无法显示|This content isn't available|isn't available|链接无法使用/i
});

async function checkPageErrors(page) {
  const body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 2000) : ""));
  const s = ERROR_SIGNALS();
  if (s.notfound.test(body)) fail("PAGE_NOT_FOUND", "Facebook page not found or content unavailable for the given page");
  if (s.auth.test(body)) fail("AUTH_REQUIRED", "Facebook login required — open facebook.com in the browser and log in");
  if (s.block.test(body)) fail("ACCESS_BLOCKED", "Facebook account check or temporary block page detected");
}

async function waitForPageHeader(page) {
  // Invalid/removed pages show the error immediately — check before waiting for
  // the header so a missing page fails fast instead of hitting the 20s timeout.
  await checkPageErrors(page);
  try {
    await page.waitForSelector('a[href*="/followers"]', { timeout: 20000 });
  } catch (_) {
    await checkPageErrors(page);
    fail("DRIFT_DETECTED", "Facebook page header (follower link) was not found");
  }
}

// ---------------------------------------------------------------------------

export default async (page, params, cwd) => {
  const pageName = String(params.page ?? "").trim();
  if (!pageName) fail("MISSING_PARAM", "page is required — the vanity name from facebook.com/{page}");
  if (/[\s\/?#&=]/.test(pageName)) fail("INVALID_PARAM", "page must be a single vanity name segment from the Page URL");

  const tab = String(params.tab ?? "posts").trim().toLowerCase();
  if (!TABS.includes(tab)) fail("INVALID_PARAM", "tab must be one of: posts | about | photos | reels | followers");

  const limit = integerLimit(params.limit);

  const base = "https://www.facebook.com/" + encodeURIComponent(pageName);
  let url;
  switch (tab) {
    case "posts": url = base + "/"; break;
    case "about": url = base + "/about"; break;
    case "photos": url = base + "/photos"; break;
    case "reels": url = base + "/reels_tab"; break;
    case "followers": url = base + "/followers"; break;
    default: url = base + "/"; break;
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitRandom(600, 1100);
  await waitForPageHeader(page);

  if (tab === "about") {
    const about = await page.evaluate(extractAbout);
    about.url = "https://www.facebook.com/" + pageName;
    return { page: pageName, tab, count: 1, limit: null, partial: false, about };
  }

  let result;
  if (tab === "posts") {
    result = await collect(page, extractPosts, p => p.permalink, limit, "endMsg");
    return { page: pageName, tab, count: result.items.length, limit, partial: result.partial, posts: result.items };
  }
  if (tab === "photos") {
    result = await collect(page, extractPhotos, p => p.url, limit);
    return { page: pageName, tab, count: result.items.length, limit, partial: result.partial, photos: result.items };
  }
  if (tab === "reels") {
    result = await collect(page, extractReels, p => p.url, limit);
    return { page: pageName, tab, count: result.items.length, limit, partial: result.partial, reels: result.items };
  }
  if (tab === "followers") {
    result = await collect(page, extractFollowers, p => p.name + "|" + p.url, limit);
    return { page: pageName, tab, count: result.items.length, limit, partial: result.partial, followers: result.items };
  }

  fail("INVALID_PARAM", "tab must be one of: posts | about | photos | reels | followers");
};
