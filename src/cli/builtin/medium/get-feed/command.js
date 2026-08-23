// Medium Homepage Feed — story cards from the For You / Featured tabs.
// Data surface: DOM cards `article[data-testid="post-preview"]` (the homepage
// Apollo state only embeds Staff Picks, not the main feed — verified in explore).
// Requires a logged-in Medium session: the For You feed is personalized.
export default async (page, params, cwd) => {

  // ---------- Parameter validation (before any page access) ----------
  const feed = (params.feed || "").trim().toLowerCase();
  if (feed !== "for-you" && feed !== "featured") {
    const err = new Error("[INVALID_PARAM] feed must be one of: for-you | featured (got: '" + params.feed + "')");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(params.limit, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100 (got: '" + params.limit + "')");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const sleep = (ms) => page.waitForTimeout(ms);
  const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

  // ---------- Navigate ----------
  const url = "https://medium.com/?feed=" + feed;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // ---------- Light polite-pacing behavior (kept cheap) ----------
  try {
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    if (vp && vp.w > 0 && vp.h > 0) {
      await page.mouse.move(rand(50, Math.max(60, vp.w - 60)), rand(50, Math.max(60, vp.h - 60)), { steps: rand(5, 12) });
      await sleep(rand(200, 600));
      await page.evaluate(() => window.scrollBy({ top: 150 + Math.floor(Math.random() * 250), behavior: "smooth" }));
      await sleep(rand(300, 800));
      await page.evaluate(() => window.scrollBy({ top: -(80 + Math.floor(Math.random() * 120)), behavior: "smooth" }));
      await sleep(rand(200, 500));
    }
  } catch (_) {
    // Cosmetic interaction only; never block extraction on it.
  }

  // ---------- Login check ----------
  // Verified signal (logged-in): __APOLLO_STATE__ has a UserViewerEdge key whose
  // userId equals its viewerId, e.g. "UserViewerEdge:userId:<hex>-viewerId:<same hex>".
  // Wait for either that signal or a visible sign-in CTA, then decide.
  let loginState = "unknown";
  try {
    loginState = await page.waitForFunction(
      () => {
        const st = window.__APOLLO_STATE__;
        if (st) {
          const edge = Object.keys(st).some((k) => /^UserViewerEdge:userId:([A-Za-z0-9]+)-viewerId:\1$/.test(k));
          if (edge) return "logged-in";
        }
        const signIn = [...document.querySelectorAll("a,button")].some((el) => /^\s*sign in\s*$/i.test(el.textContent || ""));
        if (signIn) return "logged-out";
        return false;
      },
      { timeout: 20000 }
    ).then((h) => h.jsonValue());
  } catch (_) {
    loginState = "unknown";
  }
  if (loginState === "logged-out") {
    const err = new Error("[AUTH_REQUIRED] Medium session is not logged in. The For You feed is personalized and meaningless without login — sign in to Medium in the attached browser and retry.");
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  if (loginState === "unknown") {
    const err = new Error("[PAGE_LOAD_FAILED] Could not confirm Medium login state within timeout (Apollo state did not hydrate). Retry, or check the attached browser session.");
    err.code = "PAGE_LOAD_FAILED";
    throw err;
  }

  // ---------- Wait for feed cards OR the featured empty state ----------
  // Featured tab (current Medium behavior): "featured stories from the
  // publications you follow" — renders `h2` "No featured stories" when empty.
  const CARD_SELECTOR = 'article[data-testid="post-preview"]';
  let state = "cards";
  try {
    state = await page.waitForFunction(
      (sel) => {
        if (document.querySelector(sel)) return "cards";
        const emptyH2 = [...document.querySelectorAll("h1,h2")].some((h) => /no featured stories/i.test(h.textContent || ""));
        if (emptyH2) return "empty";
        return false;
      },
      CARD_SELECTOR,
      { timeout: 20000 }
    ).then((h) => h.jsonValue());
  } catch (_) {
    state = "none";
  }

  if (state === "empty") {
    return {
      feed,
      items: [],
      count: 0,
      emptyReason: "No featured stories — Medium's Featured tab shows featured stories from the publications you follow, and there are none right now.",
    };
  }
  if (state === "none") {
    const err = new Error("[DRIFT_DETECTED] Neither feed cards (" + CARD_SELECTOR + ") nor the featured empty state appeared on " + url + ". The page structure may have changed.");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  // Best-effort hydration wait: card skeletons render before the engagement
  // icons (clap/response/repost svgs). Extracting too early zeroes the counts
  // (observed in practice). Non-fatal on timeout — counts degrade to 0.
  try {
    await page.waitForFunction(
      (sel) => {
        const card = document.querySelector(sel);
        if (!card) return false;
        return [...card.querySelectorAll("svg")].some((s) => {
          const d = s.querySelector("desc,title");
          return d && /clap/i.test(d.textContent || "");
        });
      },
      CARD_SELECTOR,
      { timeout: 8000 }
    );
  } catch (_) { /* counts will degrade to 0 rather than fail */ }

  // ---------- Extraction (self-contained in the page sandbox) ----------
  const extractCards = () => {
    const parseCount = (t) => {
      const m = /^([\d.,]+)([KM]?)$/.exec((t || "").trim());
      if (!m) return 0;
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (m[2] === "K") n *= 1000;
      if (m[2] === "M") n *= 1000000;
      return Math.round(n);
    };
    const DATE_RE = /^(\d+[smhdw] ago|Just now|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(,\s*\d{4})?)$/;
    const NUM_RE = /^[\d.,]+[KM]?$/;

    const countFor = (card, label) => {
      const svg = [...card.querySelectorAll("svg")].find((s) => {
        const d = s.querySelector("desc,title");
        return d && (d.textContent || "").trim() === label;
      });
      if (!svg) return 0;
      let el = svg.parentElement;
      for (let i = 0; i < 5 && el && el !== card; i++) {
        const num = [...el.querySelectorAll("span")].find((s) => s.children.length === 0 && NUM_RE.test((s.textContent || "").trim()));
        if (num) return parseCount(num.textContent);
        el = el.parentElement;
      }
      return 0;
    };

    return [...document.querySelectorAll('article[data-testid="post-preview"]')].map((card) => {
      const h2 = card.querySelector("h2");
      const title = h2 ? (h2.textContent || "").trim() : (card.getAttribute("aria-label") || "").trim();
      const h3 = card.querySelector("h3");
      const subtitle = h3 ? (h3.textContent || "").trim() : null;

      let postUrl = null;
      const titleLink = h2 ? (h2.closest("a") || h2.querySelector("a")) : null;
      if (titleLink) {
        try {
          const u = new URL(titleLink.getAttribute("href"), location.origin);
          u.search = "";
          u.hash = "";
          postUrl = u.href;
        } catch (_) { postUrl = null; }
      }

      // Author: link to a bare /@<username> profile with visible text.
      const authorLink = [...card.querySelectorAll("a")].find((x) => /^\/@[^/?]+\/?(\?.*)?$/.test(x.getAttribute("href") || "") && (x.textContent || "").trim());
      const author = authorLink
        ? { name: authorLink.textContent.trim(), username: ((authorLink.getAttribute("href").match(/^\/@([^/?]+)/)) || [])[1] || "" }
        : null;

      // Byline container: walk up from the author link until a date leaf appears.
      let container = authorLink;
      for (let i = 0; i < 6 && container && container !== card; i++) {
        const leaves = [...container.querySelectorAll("*")].filter((x) => x.children.length === 0).map((x) => (x.textContent || "").trim());
        if (leaves.some((t) => DATE_RE.test(t))) break;
        container = container.parentElement;
      }
      let publication = null;
      let publishedAt = null;
      if (container && container !== card) {
        const pubLink = [...container.querySelectorAll("a")].find((x) => x !== authorLink && (x.textContent || "").trim());
        if (pubLink) {
          let slug = "";
          try { slug = new URL(pubLink.getAttribute("href"), location.origin).pathname.split("/").filter(Boolean)[0] || ""; } catch (_) { slug = ""; }
          publication = { name: pubLink.textContent.trim(), slug };
        }
        const leaves = [...container.querySelectorAll("*")].filter((x) => x.children.length === 0).map((x) => (x.textContent || "").trim());
        publishedAt = leaves.find((t) => DATE_RE.test(t)) || null;
      }

      // "Because you follow <topic>" hint row.
      const hintDiv = [...card.querySelectorAll("div")].find((d) => {
        const first = [...d.querySelectorAll("*")].filter((x) => x.children.length === 0).map((x) => (x.textContent || "").trim())[0];
        return first === "Because you follow" && d.querySelector('a[href*="/tag/"]');
      });
      const hintLink = hintDiv ? hintDiv.querySelector('a[href*="/tag/"]') : null;

      // Preview image: among imgs whose alt equals the title, take the largest resize width.
      const imgs = [...card.querySelectorAll("img")].filter((im) => (im.alt || "").trim() === title);
      const widthOf = (im) => { const m = /resize:\w+:(\d+)/.exec(im.src || ""); return m ? parseInt(m[1], 10) : 0; };
      imgs.sort((a, b) => widthOf(b) - widthOf(a));

      return {
        title,
        subtitle,
        url: postUrl,
        author,
        publication,
        publishedAt,
        clapCount: countFor(card, "A clap icon"),
        responseCount: countFor(card, "A response icon"),
        repostCount: countFor(card, "Repost icon"),
        previewImageUrl: imgs.length ? imgs[0].src : null,
        isMemberOnly: !!card.querySelector('button[aria-label="Member-only story"]'),
        basedOnTopic: hintLink ? hintLink.textContent.trim() : null,
      };
    }).filter((item) => item.title && item.url);
  };

  // ---------- Scroll loop: lazy-load until limit or no growth ----------
  const seen = new Map();
  const collect = async () => {
    const batch = await page.evaluate(extractCards);
    for (const item of batch) if (!seen.has(item.url)) seen.set(item.url, item);
  };

  // Newly lazy-loaded card batches hydrate their engagement icons (clap /
  // repost svgs) a moment after the skeleton renders — extracting right after
  // a scroll zeroes those counts for the fresh batch (observed with limit=100:
  // zero-clap clusters at indices 40-44, 70-74, ...). Best-effort wait for the
  // LAST card's icons before each collect; non-fatal on timeout.
  const waitLastCardHydrated = async () => {
    try {
      await page.waitForFunction(
        (sel) => {
          const cards = document.querySelectorAll(sel);
          if (!cards.length) return false;
          const last = cards[cards.length - 1];
          const labels = [...last.querySelectorAll("svg")].map((s) => {
            const d = s.querySelector("desc,title");
            return d ? (d.textContent || "").trim() : "";
          });
          return labels.some((t) => /clap/i.test(t)) && labels.some((t) => /repost/i.test(t));
        },
        CARD_SELECTOR,
        { timeout: 4000 }
      );
    } catch (_) { /* counts degrade to 0 rather than fail */ }
  };

  await collect();
  const MAX_SCROLLS = 80;
  const MAX_STALE = 4;
  let stale = 0;
  let scrolls = 0;
  while (seen.size < limit && stale < MAX_STALE && scrolls < MAX_SCROLLS) {
    const before = seen.size;
    await page.evaluate(() => window.scrollBy({ top: 1200 + Math.floor(Math.random() * 800), behavior: "smooth" }));
    await sleep(rand(900, 1700));
    // Occasional tiny mouse jiggle while waiting, keeps the session polite.
    if (Math.random() < 0.35) {
      try { await page.mouse.move(rand(100, 700), rand(100, 500), { steps: rand(3, 8) }); } catch (_) { /* ignore */ }
    }
    await waitLastCardHydrated();
    await collect();
    scrolls += 1;
    stale = seen.size > before ? 0 : stale + 1;
  }

  const items = [...seen.values()].slice(0, limit);
  const partial = seen.size < limit;

  // Small randomized pause before finishing.
  await sleep(rand(300, 1200));

  return {
    feed,
    items,
    count: items.length,
    ...(partial ? { partial: true } : {}),
  };
};
