// facebook/get-feed: fetch the Facebook home feed as structured posts.
// Stable anchors only: ARIA roles, data-ad-preview, URL path structure. No class names.

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

// Self-contained extractor that runs inside the browser page context.
// It must not reference any outer variable.
function extractFeedPosts() {
  const feed = document.querySelector('div[role="feed"]');
  if (!feed) return { feedFound: false, posts: [], endMsg: null };

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

  const articles = Array.from(feed.querySelectorAll('div[role="article"]'));
  const posts = [];

  articles.forEach(a => {
    const permLink = Array.from(a.querySelectorAll("a")).find(x => isPostLink(x.getAttribute("href") || ""));
    if (!permLink) return;

    // Author: first link pointing at a profile/page URL with visible text.
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
      const url = au.includes("profile.php?id=")
        ? urlPath + "?" + au.split("?")[1].split("&")[0]
        : urlPath;
      author = { name: authorCands[0].innerText.trim(), url };
    }

    // Text: message element, strip trailing "… 展开" / "… See more" truncation marker.
    const msgEl = a.querySelector('[data-ad-preview="message"]');
    let text = msgEl ? msgEl.innerText.trim() : null;
    if (text) text = text.replace(/…\s*(展开|See more|More|继续阅读)\s*$/, "").trim() || null;

    // Time: permalink link's aria-label or innerText (localized relative time).
    const time = permLink.getAttribute("aria-label") || permLink.innerText.trim();

    // Stats: role=button elements whose text is a bare count (supports 万/千/K/M),
    // first three in DOM order map to likes/comments/shares.
    const statBtns = Array.from(a.querySelectorAll('[role="button"]')).filter(x => {
      const t = (x.innerText || "").trim();
      return /^[\d.,]+\s*(万|千|K|M)?$/.test(t) && t.length < 12;
    });
    const stats = {
      likes: num(statBtns[0]),
      comments: num(statBtns[1]),
      shares: num(statBtns[2])
    };

    // Media: photos via /photo/ links (use srcset first candidate), videos via poster.
    const media = [];
    Array.from(a.querySelectorAll('a[href*="/photo/"] img')).forEach(img => {
      const srcset = img.getAttribute("srcset");
      const url = srcset ? srcset.split(",")[0].trim().split(" ")[0] : (img.getAttribute("src") || "");
      if (url.startsWith("http")) media.push({ type: "photo", url });
    });
    Array.from(a.querySelectorAll("video")).forEach(v => {
      if (v.getAttribute("poster")) media.push({ type: "video", url: v.getAttribute("poster") });
    });

    // Skip non-post articles (empty placeholders, Reels recommendation rails).
    if (!author && !text && media.length === 0) return;

    posts.push({
      author,
      text,
      permalink: cleanUrl(permLink.getAttribute("href") || ""),
      time,
      media,
      stats
    });
  });

  const endMsg = document.body.innerText.match(/(已全部看完|You.?re all caught up)/i);
  return {
    feedFound: true,
    posts,
    endMsg: endMsg ? endMsg[0] : null,
    scrollY: window.scrollY || 0,
    scrollHeight: document.documentElement.scrollHeight || 0,
    innerHeight: window.innerHeight || 0
  };
}

export default async (page, params, cwd) => {
  const limit = integerLimit(params.limit);
  const url = "https://www.facebook.com/";

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitRandom(600, 1100);

  let state;
  try {
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
  } catch (_) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    if (/log into facebook|登录 facebook|sign up for facebook|注册 facebook/i.test(body)) {
      fail("AUTH_REQUIRED", "Facebook login required — open facebook.com in the browser and log in");
    }
    if (/temporarily locked|checkpoint|确认你的身份|security check|account has been/i.test(body)) {
      fail("ACCESS_BLOCKED", "Facebook account check or temporary block page detected");
    }
    fail("DRIFT_DETECTED", "Facebook feed container div[role=feed] was not found");
  }

  state = await page.evaluate(extractFeedPosts);
  if (!state.feedFound) fail("DRIFT_DETECTED", "Facebook feed container div[role=feed] was not found");

  const seen = new Set();
  const posts = [];
  const addPosts = list => {
    for (const p of list) {
      if (seen.has(p.permalink)) continue;
      seen.add(p.permalink);
      posts.push(p);
      if (posts.length >= limit) break;
    }
  };

  addPosts(state.posts);
  let feedDone = Boolean(state.endMsg);
  let staleScrolls = 0;
  let attempts = 0;
  let lastScrollY = state.scrollY || 0;
  const MAX_ATTEMPTS = 45;

  while (posts.length < limit && !feedDone && attempts < MAX_ATTEMPTS) {
    const before = posts.length;
    // Randomized scroll: move the mouse, wheel at that spot, and guarantee the
    // window actually scrolls (mouse.wheel alone can be swallowed by the controlled page).
    await page.mouse.move(100 + Math.floor(Math.random() * 1000), 200 + Math.floor(Math.random() * 500));
    await page.mouse.wheel(0, 600 + Math.floor(Math.random() * 500));
    await page.evaluate(() => window.scrollBy(0, 800 + Math.floor(Math.random() * 500)));
    await waitRandom(800, 1500);
    attempts += 1;
    state = await page.evaluate(extractFeedPosts);
    addPosts(state.posts);
    if (state.endMsg) feedDone = true;
    const scrollY = state.scrollY || 0;
    if (posts.length === before) {
      // Feed may still be appending asynchronously; only count a "stale" scroll
      // when the window also stopped moving. Facebook throttling appends nothing,
      // so scrollY plateaus at the bottom and we give up gracefully (partial=true).
      if (scrollY > lastScrollY) {
        staleScrolls = 0;
      } else {
        staleScrolls += 1;
        if (staleScrolls >= 5) feedDone = true;
      }
    } else {
      staleScrolls = 0;
    }
    lastScrollY = scrollY;
  }

  const partial = posts.length < limit;
  return {
    posts: posts.slice(0, limit),
    count: posts.length,
    limit,
    partial
  };
};
