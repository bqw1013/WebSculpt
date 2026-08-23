// facebook/get-profile: fetch a Facebook personal profile and its sub-pages.
// Tabs: all (posts), about (structured bio), photos, reels, followers, following, friends.
// Stable anchors only: ARIA roles, data-ad-preview, URL path structure. No class names.
// user accepts a numeric ID or a username; both URL forms (/profile.php?id= and /{username})
// are resolved uniformly with the ?sk= parameter.

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

const TABS = {
  all: "",
  about: "about",
  photos: "photos",
  reels: "reels_tab",
  followers: "followers",
  following: "following",
  friends: "friends"
};
const TAB_KEYS = Object.keys(TABS);
const LIST_TABS = new Set(["all", "photos", "reels", "followers", "following", "friends"]);

// Resolve the profile base URL from a numeric ID or username (also tolerates full profile URLs).
function resolveUser(user) {
  const raw = String(user ?? "").trim();
  if (!raw) fail("MISSING_PARAM", "user is required — numeric user ID or username (copy from the profile URL or use facebook/search --type people)");
  let s = raw;
  s = s.replace(/^https?:\/\/(?:www\.|m\.|mobile\.)?facebook\.com\//i, "");
  let m = s.match(/^profile\.php\?id=(\d+)/i);
  if (m) return `https://www.facebook.com/profile.php?id=${m[1]}`;
  s = s.split(/[?/]/)[0].replace(/^@/, "");
  if (/^\d+$/.test(s)) return `https://www.facebook.com/profile.php?id=${s}`;
  if (!s || !/^[A-Za-z0-9.]+$/.test(s)) fail("INVALID_PARAM", `user must be a numeric ID or username, got: ${raw}`);
  return `https://www.facebook.com/${s}`;
}

function resolveTab(tab) {
  const t = String(tab ?? "all").toLowerCase();
  if (!TAB_KEYS.includes(t)) {
    fail("INVALID_PARAM", `tab must be one of: ${TAB_KEYS.join(", ")} (all=全部 | about=简介 | photos=照片 | reels=Reels | followers=粉丝 | following=关注 | friends=好友)`);
  }
  return t;
}

function tabUrl(base, tab) {
  if (tab === "all") return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}sk=${TABS[tab]}`;
}

async function gotoPage(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (_) {
    await waitRandom(800, 1500);
  }
  await waitRandom(700, 1400);
}

async function checkPage(page) {
  const body = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  if (/log into facebook|登录 facebook|sign up for facebook|注册 facebook|创建新帐户/i.test(body)) {
    fail("AUTH_REQUIRED", "Facebook login required — open facebook.com in the browser and log in");
  }
  if (/temporarily locked|checkpoint|确认你的身份|security check|account has been|你的帐户已被/i.test(body)) {
    fail("ACCESS_BLOCKED", "Facebook account check or temporary block page detected");
  }
  if (/此内容目前无法显示|内容暂时无法显示|内容目前不可用|内容暂时不可用|暂时无法显示|isn.?t available right now|this content isn.?t available|链接可能已损坏|the link you followed may be broken|对不起，找不到此页面|找不到此页面/i.test(body)) {
    fail("NOT_FOUND", "Facebook profile not found or inaccessible (the profile may be deleted, renamed, or restricted)");
  }
  return body;
}

async function waitForMain(page) {
  try {
    await page.waitForSelector('div[role="main"]', { timeout: 15000 });
  } catch (_) {
    await checkPage(page);
    fail("DRIFT_DETECTED", "Facebook profile main container div[role=main] was not found");
  }
}

// --- Self-contained extractors (run inside the browser page context) ---

// Posts extractor for the "all" tab. The profile timeline has NO div[role=feed]
// container (unlike the home feed): posts are top-level div[role=article].
// Comment articles are nested inside their parent post article, so we keep only
// articles that are not contained by another article.
function extractPosts() {
  const articles = Array.from(document.querySelectorAll('div[role="article"]'));
  const topLevel = articles.filter(a => !articles.some(o => o !== a && o.contains(a)));

  const isPostLink = h => /\/posts\/|permalink\.php|\/watch\/\?v=|\/reel\/|\/videos\/|\/groups\/[^/]+\/permalink\//.test(h);
  const cleanUrl = u => {
    const [path, q] = u.split("?");
    if (!q) return u;
    const keep = q.split("&").filter(p => !p.startsWith("__") && p !== "s=ifu");
    const c = keep.length ? path + "?" + keep.join("&") : path;
    return c.replace(/\/$/, "");
  };
  const num = el => {
    if (!el) return null;
    const m = (el.innerText || "").trim().match(/^([\d.,]+)\s*(万|千|K|M)?$/);
    return m ? m[1] + (m[2] || "") : null;
  };

  const posts = [];
  topLevel.forEach(a => {
    const permLink = Array.from(a.querySelectorAll("a")).find(x => isPostLink(x.getAttribute("href") || ""));
    if (!permLink) return;

    let author = null;
    const authorCands = Array.from(a.querySelectorAll("a")).filter(x => {
      const h = (x.getAttribute("href") || "").split("?")[0];
      const t = (x.innerText || "").trim();
      if (!t || t.length > 60) return false;
      if (isPostLink(h) || h.includes("/photo") || h.includes("/stories") || h.includes("/groups") ||
          h.includes("/reel") || h.includes("/watch") || h.includes("/videos") || h.includes("/login") ||
          h.includes("/help") || h.includes("/policy") || h.includes("hashtag") || h === "/" || h === "#") return false;
      return /facebook\.com\/[^/]+$/.test(h) || /facebook\.com\/profile\.php\?id=/.test(h) ||
             /^\/[^/]+\/?$/.test(h) || /^\/profile\.php\?id=/.test(h);
    });
    if (authorCands.length) {
      const au = authorCands[0].getAttribute("href") || "";
      const urlPath = au.split("?")[0];
      const url = au.includes("profile.php?id=")
        ? urlPath + "?" + au.split("?")[1].split("&")[0]
        : urlPath;
      author = { name: authorCands[0].innerText.trim(), url };
    }

    const msgEl = a.querySelector('[data-ad-preview="message"]');
    let text = msgEl ? msgEl.innerText.trim() : null;
    if (text) text = text.replace(/…\s*(展开|See more|More|继续阅读)\s*$/, "").trim() || null;

    const time = permLink.getAttribute("aria-label") || permLink.innerText.trim();

    const statBtns = Array.from(a.querySelectorAll('[role="button"]')).filter(x => {
      const t = (x.innerText || "").trim();
      return /^[\d.,]+\s*(万|千|K|M)?$/.test(t) && t.length < 12;
    });
    const stats = {
      likes: num(statBtns[0]),
      comments: num(statBtns[1]),
      shares: num(statBtns[2])
    };

    const media = [];
    Array.from(a.querySelectorAll('a[href*="/photo/"] img')).forEach(img => {
      const srcset = img.getAttribute("srcset");
      const url = srcset ? srcset.split(",")[0].trim().split(" ")[0] : (img.getAttribute("src") || "");
      if (url.startsWith("http")) media.push({ type: "photo", url });
    });
    Array.from(a.querySelectorAll("video")).forEach(v => {
      if (v.getAttribute("poster")) media.push({ type: "video", url: v.getAttribute("poster") });
    });

    if (!author && !text && media.length === 0) return;
    posts.push({ author, text, permalink: cleanUrl(permLink.getAttribute("href") || ""), time, media, stats });
  });

  return {
    items: posts,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0,
    innerHeight: window.innerHeight || 0
  };
}

// Photos extractor: photo tiles link to /photo/?fbid={id}; grab the CDN image src.
function extractPhotos() {
  const main = document.querySelector('div[role="main"]');
  const items = [];
  const seen = new Set();
  if (main) {
    Array.from(main.querySelectorAll('a[href*="/photo/?fbid="]')).forEach(a => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/fbid=(\d+)/);
      if (!m) return;
      const url = `https://www.facebook.com/photo/?fbid=${m[1]}`;
      if (seen.has(url)) return;
      seen.add(url);
      const img = a.querySelector("img");
      const src = img ? (img.getAttribute("src") || "") : "";
      if (src.startsWith("http")) items.push({ url, image: src });
    });
  }
  return {
    items,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0,
    innerHeight: window.innerHeight || 0
  };
}

// Reels extractor: reel tiles link to /reel/{id} and carry the play count as text.
// No title is exposed on the tile grid (only the thumbnail + play count + URL).
function extractReels() {
  const main = document.querySelector('div[role="main"]');
  const items = [];
  const seen = new Set();
  if (main) {
    Array.from(main.querySelectorAll('a[href*="/reel/"]')).forEach(a => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/reel\/(\d+)/);
      if (!m) return;
      const url = `https://www.facebook.com/reel/${m[1]}`;
      if (seen.has(url)) return;
      seen.add(url);
      const text = a.innerText.trim();
      const playCount = /^[\d.,]+\s*(万|千|K|M)?$/.test(text) ? text : null;
      const img = a.querySelector("img");
      const thumbnail = img && img.getAttribute("src") && img.getAttribute("src").startsWith("http") ? img.getAttribute("src") : null;
      items.push({ url, play_count: playCount, thumbnail });
    });
  }
  return {
    items,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0,
    innerHeight: window.innerHeight || 0
  };
}

// Followers/following/friends extractor: entity cards carry a name link pointing to a
// profile/page URL (profile.php?id= or single-segment vanity). Primary anchor: each card
// has a short action button ("关注"/"Follow" etc.) that we use to locate the card.
function extractConnections() {
  const main = document.querySelector('div[role="main"]');
  const bodyText = document.body.innerText;

  const isEntityLink = a => {
    const t = a.innerText.trim();
    const h = a.getAttribute("href") || "";
    if (!t || t.length > 40 || t.length < 1) return false;
    try {
      const u = new URL(h, location.origin);
      if (u.pathname.startsWith("/profile.php")) return !!u.searchParams.get("id");
      const seg = u.pathname.split("/").filter(Boolean);
      return seg.length === 1 && !/^(posts|photo|reel|watch|groups|search|hashtag|story|list|friend|about|followers|following|reels_tab|events|map|l\.php|me|home|messages|notifications|bookmarks|saved|games|marketplace|fundraisers|profile\.php|people|pages|directory)$/.test(seg[0]);
    } catch (_) { return false; }
  };
  const linkUrl = a => {
    const u = new URL(a.getAttribute("href"), location.origin);
    return u.pathname.startsWith("/profile.php")
      ? `https://www.facebook.com/profile.php?id=${u.searchParams.get("id")}`
      : `https://www.facebook.com${u.pathname}`;
  };

  const seen = new Set();
  const entities = [];

  // Detect whether the loaded page is the followers/following connections page.
  // The friends page has its own tablist (好友/加好友请求/搜索好友); the
  // followers/following page has an internal 2-tab toggle (粉丝/已关注). When a
  // profile has no visible friends, ?sk=friends falls back to the followers page.
  let isFollowPage = false;
  if (main) {
    const tablists = Array.from(main.querySelectorAll('div[role="tablist"]'));
    isFollowPage = tablists.some(tl => {
      const texts = Array.from(tl.querySelectorAll('[role="tab"]')).map(t => t.innerText.trim());
      if (texts.length !== 2) return false;
      return texts.some(t => /粉丝|Followers/.test(t)) && texts.some(t => /已关注|Following/.test(t));
    });
  }

  if (main) {
    const actionBtns = Array.from(main.querySelectorAll('div[role="button"]')).filter(b => {
      const t = b.innerText.trim();
      return t.length > 0 && t.length < 8 && /^(关注|已关注|Follow|Following|好友|Add Friend|朋友|Message|发消息)$/.test(t);
    });
    for (const btn of actionBtns) {
      let el = btn;
      let nameLink = null;
      for (let i = 0; i < 7; i++) {
        el = el.parentElement;
        if (!el) break;
        const cand = Array.from(el.querySelectorAll("a[href]")).find(isEntityLink);
        if (cand) { nameLink = cand; break; }
      }
      if (!nameLink) continue;
      const url = linkUrl(nameLink);
      if (seen.has(url)) continue;
      seen.add(url);
      entities.push({ name: nameLink.innerText.trim(), url });
    }
  }

  // Empty state: no friend cards on the friends tab shows "没有好友可显示" etc.
  const emptyState = /没有好友可显示|No friends to show|No friends yet|暂无好友/i.test(bodyText);

  return {
    items: entities,
    emptyState,
    isFollowPage,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0,
    innerHeight: window.innerHeight || 0
  };
}

// --- Scroll-and-collect loop (natural scrolling, polite pacing) ---
async function collectWithScroll(page, extractor, limit) {
  let state = await page.evaluate(extractor);
  const seen = new Set();
  const items = [];
  const addItems = list => {
    for (const item of list) {
      const key = item.url || item.permalink || item.image || JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) break;
    }
  };
  addItems(state.items);
  let staleScrolls = 0;
  let noGrowthStreak = 0;
  let attempts = 0;
  let lastScrollY = state.scrollY || 0;
  const MAX_ATTEMPTS = 30;
  while (items.length < limit && attempts < MAX_ATTEMPTS) {
    if (items.length === 0 && attempts >= 3) break;
    const before = items.length;
    await page.mouse.move(100 + Math.floor(Math.random() * 1000), 200 + Math.floor(Math.random() * 500));
    await page.mouse.wheel(0, 600 + Math.floor(Math.random() * 500));
    await page.evaluate(() => window.scrollBy(0, 800 + Math.floor(Math.random() * 500)));
    await waitRandom(800, 1500);
    attempts += 1;
    state = await page.evaluate(extractor);
    addItems(state.items);
    const scrollY = state.scrollY || 0;
    if (items.length === before) {
      noGrowthStreak += 1;
      // Grids (photos/reels) may not infinite-scroll; stop after a few no-growth scrolls.
      if (noGrowthStreak >= 4) break;
      if (scrollY > lastScrollY) staleScrolls = 0;
      else {
        staleScrolls += 1;
        if (staleScrolls >= 5) break;
      }
    } else {
      noGrowthStreak = 0;
      staleScrolls = 0;
    }
    lastScrollY = scrollY;
  }
  return {
    items: items.slice(0, limit),
    partial: items.length < limit,
    meta: {
      emptyState: Boolean(state.emptyState),
      isFollowPage: Boolean(state.isFollowPage)
    }
  };
}

// --- About extraction (structured bio fields) ---

function parseBio(text) {
  const headingRe = /^(个性签名|关于你|你的详细资料|已置顶的详细信息|个人资料|个人详情|工作经历|教育经历|爱好|兴趣|旅行|链接|联系信息|名字|类别|详细信息|隐私和法律信息)$/;
  const bioMatch = text.match(/(?:个性签名|Bio)\s*\n([^\n]+)/);
  if (bioMatch) {
    const v = bioMatch[1].trim();
    if (v && !headingRe.test(v)) return v;
  }
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const tabIdx = lines.findIndex(l => /^全部$|^All$|^Posts$|^Home$/.test(l));
  const header = (tabIdx > 0 ? lines.slice(0, tabIdx) : lines.slice(0, 25));
  for (const l of header) {
    if (l.length > 20 && !/位粉丝|关注|展开|立即观看|发消息|消息|多加几位好友|你可能会认识|推荐|建议|Add more friends|people you may know|分享想法/.test(l) && /[a-zA-Z一-龥]{4}/.test(l)) {
      return l;
    }
  }
  return null;
}

// Remove section headings / placeholder lines from directory sub-page content.
function cleanDirectoryLines(lines) {
  const skip = new Set([
    "工作", "工作经历", "教育经历", "链接", "联系信息", "个人详情", "详细信息",
    "关于你", "个性签名", "你的详细资料", "已置顶的详细信息", "个人资料", "类别",
    "简介", "照片", "好友", "Reels", "展开", "全部", "名字", "爱好", "兴趣", "旅行",
    "个人网站", "网站", "个人主页", "主页", "博客"
  ]);
  return (lines || []).filter(l => {
    const t = l.trim();
    if (!t || t.length < 2) return false;
    if (skip.has(t)) return false;
    if (/多添加|添加更多|网站、|还没有|暂无|没有/.test(t)) return false;
    return true;
  });
}

function parseCategory(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const bioIdx = lines.findIndex(l => l.length > 20 && !/位粉丝|关注|展开|立即观看|发消息/.test(l));
  if (bioIdx >= 0 && bioIdx + 1 < lines.length) {
    const next = lines[bioIdx + 1];
    if (next.length > 1 && next.length < 20 && !/^展开$|^全部$|^简介$|^Reels$|^照片$|^粉丝$|^好友$/.test(next)) return next;
  }
  return null;
}

function parseContact(lines) {
  const text = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
  const contact = {};
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) contact.email = email[0];
  const phone = text.match(/(?:\+\d{1,3}[\s-]?)?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  if (phone && !/facebook|fbcdn/.test(phone[0])) contact.phone = phone[0];
  return Object.keys(contact).length ? contact : null;
}

function parseLocation(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const text = arr.join("\n");
  const m = text.match(/(?:来自|现居|目前住在|所在地|位于|located in|current city|lives in)\s*[:：]?\s*([^\n]+)/i);
  if (m) {
    const v = m[1].trim();
    if (v && !/^没有|^暂无|^No |^not /.test(v)) return v;
  }
  return null;
}

async function fetchDirectoryLines(page, href) {
  const url = new URL(href, page.url()).href;
  await gotoPage(page, url);
  await waitForMain(page);
  const lines = await page.evaluate(() => {
    const main = document.querySelector('div[role="main"]');
    if (!main) return [];
    const tablists = Array.from(main.querySelectorAll('div[role="tablist"]'));
    const tl = tablists.find(x => Array.from(x.querySelectorAll("a[href]")).some(a => /(directory_|sk=directory)/.test(a.getAttribute("href") || "")));
    if (!tl) return [];
    const container = tl.parentElement;
    if (!container) return [];
    const parts = [];
    Array.from(container.children).forEach(c => {
      if (c === tl) return;
      const t = c.innerText.trim();
      if (t) parts.push(t);
    });
    const containerText = parts.join("\n");
    return containerText.split("\n").map(l => l.trim()).filter(l => l && l.length > 1);
  });
  return lines;
}

async function getAbout(page, baseUrl) {
  // page is already on {baseUrl}?sk=about
  const probe = await page.evaluate(() => {
    const main = document.querySelector('div[role="main"]');
    const text = main ? main.innerText : "";
    const tablists = Array.from(document.querySelectorAll('div[role="tablist"]'));
    const dirTl = tablists.find(x => Array.from(x.querySelectorAll("a[href]")).some(a => /(directory_|sk=directory)/.test(a.getAttribute("href") || "")));
    const dirLinks = {};
    if (dirTl) {
      Array.from(dirTl.querySelectorAll("a[href]")).forEach(a => {
        const h = a.getAttribute("href") || "";
        const label = (a.innerText || "").trim().toLowerCase();
        const hay = label + " " + h.toLowerCase();
        if (/work|工作/.test(hay)) dirLinks.work = h;
        else if (/educat|教育/.test(hay)) dirLinks.education = h;
        else if (/personal_details|basic_info|个人详情|详细/.test(hay)) dirLinks.details = h;
        else if (/contact|联系/.test(hay)) dirLinks.contact = h;
        else if (/links|链接/.test(hay)) dirLinks.links = h;
      });
    }
    return { text, dirLinks };
  });

  const bio = parseBio(probe.text);
  const category = parseCategory(probe.text);

  let work = [];
  let education = [];
  let location = null;
  let contact = null;
  let links = [];

  if (probe.dirLinks.work) work = cleanDirectoryLines(await fetchDirectoryLines(page, probe.dirLinks.work));
  if (probe.dirLinks.education) education = cleanDirectoryLines(await fetchDirectoryLines(page, probe.dirLinks.education));
  if (probe.dirLinks.details) {
    const d = await fetchDirectoryLines(page, probe.dirLinks.details);
    location = parseLocation(d);
  }
  if (probe.dirLinks.contact) {
    const c = await fetchDirectoryLines(page, probe.dirLinks.contact);
    contact = parseContact(c);
  }
  if (probe.dirLinks.links) links = cleanDirectoryLines(await fetchDirectoryLines(page, probe.dirLinks.links));

  return { bio, category, location, work, education, contact, links };
}

// --- Main dispatch ---
export default async (page, params, cwd) => {
  const user = String(params.user ?? "").trim();
  if (!user) {
    fail("MISSING_PARAM", "user is required — numeric user ID or username (copy from the profile URL or use facebook/search --type people)");
  }
  const baseUrl = resolveUser(user);
  const tab = resolveTab(params.tab);
  const limit = tab === "about" ? null : integerLimit(params.limit);

  const targetUrl = tabUrl(baseUrl, tab);
  await gotoPage(page, targetUrl);
  await waitForMain(page);
  await checkPage(page);

  if (tab === "all") {
    const result = await collectWithScroll(page, extractPosts, limit);
    return { posts: result.items, count: result.items.length, limit, partial: result.partial };
  }

  if (tab === "about") {
    const about = await getAbout(page, baseUrl);
    return about;
  }

  if (tab === "photos") {
    const result = await collectWithScroll(page, extractPhotos, limit);
    return { photos: result.items, count: result.items.length, limit, partial: result.partial };
  }

  if (tab === "reels") {
    const result = await collectWithScroll(page, extractReels, limit);
    return { reels: result.items, count: result.items.length, limit, partial: result.partial };
  }

  // followers / following / friends
  const result = await collectWithScroll(page, extractConnections, limit);
  let items = result.items;
  let partial = result.partial;
  // friends is only meaningful when the target's friend list is visible. A
  // public figure with no friends feature falls back to the followers page;
  // in that case return an empty list (partial) instead of mislabeled data.
  if (tab === "friends" && result.meta.isFollowPage) {
    items = [];
    partial = true;
  }
  return { [tab]: items, count: items.length, limit, partial };
};
