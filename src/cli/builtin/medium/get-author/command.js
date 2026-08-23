// medium/get-author — fetch a Medium author's public profile plus one profile tab.
//
// Data path (verified during explore, see evidence.md):
//   - Profile metadata + initial home stories come from window.__APOLLO_STATE__
//     (the User node matching `username`, and its homepagePostsConnection).
//   - Scrolling lazy-loads more cards into the DOM but does NOT grow the Apollo
//     snapshot, so extra items are parsed from article[data-testid="post-preview"].
//   - activity = activity line ("<name> clapped · <date>") + a post-preview card.
//   - lists = div[data-testid="readingList"] cards. about = User.about JSON string.
//   - 404 pages contain "PAGE NOT FOUND" and no username-matching User node.

const VALID_SECTIONS = ["home", "reposts", "activity", "lists", "about"];

function throwCode(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// ---- polite pacing helpers (cheap: no big delays) ----
async function humanPause(page, minMs, maxMs) {
  await page.waitForTimeout(minMs + Math.floor(Math.random() * (maxMs - minMs)));
}
async function humanNudge(page) {
  // small mouse move + tiny smooth scroll, keeps the session polite
  try {
    await page.mouse.move(
      100 + Math.floor(Math.random() * 300),
      150 + Math.floor(Math.random() * 250)
    );
    await page.evaluate(() => {
      window.scrollBy({
        top: 80 + Math.floor(Math.random() * 160),
        behavior: "smooth",
      });
    });
  } catch {
    /* non-fatal */
  }
}

// Gentle scroll to near the bottom with jitter (polite pacing, triggers lazy load).
async function scrollDown(page) {
  await page.evaluate(() => {
    window.scrollTo({
      top: document.body.scrollHeight - Math.floor(Math.random() * 300),
      behavior: "smooth",
    });
  });
}

// ---- in-page parsers (serialized by Playwright; must stay self-contained) ----

// Parse one article[data-testid="post-preview"] card into a story object.
function parseStoryCard(a) {
  function abs(h) {
    try {
      return new URL(h, location.href).href;
    } catch (e) {
      return h || "";
    }
  }
  function toNum(s) {
    if (!s) return 0;
    s = s.replace(/,/g, "");
    let mult = 1;
    if (/K$/i.test(s)) { mult = 1000; s = s.slice(0, -1); }
    else if (/M$/i.test(s)) { mult = 1000000; s = s.slice(0, -1); }
    const v = parseFloat(s);
    return isNaN(v) ? 0 : Math.round(v * mult);
  }

  const h2 = a.querySelector("h2");
  const h3 = a.querySelector("h3");
  const title = (h2 && h2.textContent.trim()) || a.getAttribute("aria-label") || "";
  const subtitle = (h3 && h3.textContent.trim()) || "";
  const links = Array.from(a.querySelectorAll("a[href]"));
  let postUrl = "";
  let postId = "";
  const authorLinks = [];
  const pubLinks = [];
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const clean = href.split("?")[0];
    const m = clean.match(/-([0-9a-f]{10,14})\/?$/);
    if (m && !postUrl) { postUrl = abs(href); postId = m[1]; continue; }
    const am = clean.match(/^\/@([A-Za-z0-9._-]+)\/?$/);
    if (am) {
      authorLinks.push({ username: am[1], name: link.textContent.trim() });
      continue;
    }
    // publication: absolute medium.com link with a single non-@ path segment
    const pm = clean.match(/^https?:\/\/medium\.com\/([^@/?#][^/?#]*)\/?$/);
    if (pm) {
      pubLinks.push({ slug: pm[1], name: link.textContent.trim() });
    }
  }
  // cards repeat the same author/publication as icon-only and text links;
  // prefer the link that actually carries a name
  const authorPick =
    authorLinks.find((c) => c.name) || authorLinks[0] || null;
  const author = authorPick
    ? {
        name: authorPick.name,
        username: authorPick.username,
        profileUrl: "https://medium.com/@" + authorPick.username,
      }
    : { name: "", username: "", profileUrl: "" };
  const pubPick = pubLinks.find((c) => c.name) || pubLinks[0] || null;
  const publication = pubPick
    ? {
        name: pubPick.name,
        slug: pubPick.slug,
        url: "https://medium.com/" + pubPick.slug,
      }
    : null;
  const text = a.innerText || "";
  const dm = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(,\s*\d{4})?\b/
  );
  // clap / response counts: the last two short numeric tokens of the card text
  const nums = text.match(/\d[\d.,]*[KM]?/g) || [];
  let clapCount = 0, responseCount = 0;
  if (nums.length >= 2) {
    clapCount = toNum(nums[nums.length - 2]);
    responseCount = toNum(nums[nums.length - 1]);
  } else if (nums.length === 1) {
    clapCount = toNum(nums[0]);
  }
  const imgs = Array.from(a.querySelectorAll("img"));
  let previewImageUrl = null;
  let bestArea = 0;
  for (const im of imgs) {
    const src = (im.getAttribute("src") || "").replace(/^http:\/\//, "https://");
    if (!src) continue;
    // pick the largest image by declared resize dimensions (avatars are tiny)
    const rm = src.match(/resize:(?:fill|fit):(\d+)(?::(\d+))?/);
    const area = rm ? parseInt(rm[1], 10) * (rm[2] ? parseInt(rm[2], 10) : 1) : 0;
    if (area >= bestArea) {
      bestArea = area;
      previewImageUrl = src;
    }
  }
  // tiny images are author/publication avatars, not story previews
  if (bestArea < 100 * 60) previewImageUrl = null;
  return {
    postId,
    title,
    subtitle,
    url: postUrl ? postUrl.split("?")[0] : "",
    author,
    publication,
    publishedAt: null,
    dateText: dm ? dm[0] : null,
    clapCount,
    responseCount,
    readingTimeMinutes: null,
    tags: [],
    previewImageUrl,
    isMemberOnly: /member-only/i.test(text),
    isPinned: false,
    source: "dom",
  };
}

// Read the activity line ("<actor>\n<action>\n·\n<date>") preceding a card.
function parseActivityLine(card) {
  const wrap = card.parentElement;
  let actor = "", action = "", dateText = null;
  if (wrap) {
    const lines = (wrap.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const dot = lines.indexOf("·");
    if (dot >= 2) {
      action = lines[dot - 1];
      actor = lines[dot - 2];
      dateText = lines[dot + 1] || null;
    }
  }
  return { actor, action, dateText };
}

// Extract profile metadata + long bio from the Apollo snapshot.
function extractProfile(uname) {
  const st = window.__APOLLO_STATE__;
  const wanted = uname.toLowerCase();
  const userKeys = Object.keys(st).filter((k) => k.startsWith("User:"));
  let found = null;
  for (const k of userKeys) {
    const u = st[k];
    if (u && typeof u.username === "string" && u.username.toLowerCase() === wanted) {
      found = u;
      break;
    }
  }
  if (!found) return { __notFound: true, userNodeCount: userKeys.length };

  // Long-form "about" (JSON string of Medium content-model paragraphs)
  let aboutText = "";
  if (typeof found.about === "string" && found.about.trim()) {
    try {
      const blocks = JSON.parse(found.about);
      if (Array.isArray(blocks)) {
        aboutText = blocks
          .map((b) =>
            Array.isArray(b.children) ? b.children.map((c) => c.text || "").join("") : ""
          )
          .filter((t) => t.trim().length > 0)
          .join("\n");
      }
    } catch {
      aboutText = "";
    }
  }

  return {
    username: found.username || uname,
    name: found.name || "",
    bio: found.bio || "",
    imageId: found.imageId || "",
    followersCount:
      found.socialStats && typeof found.socialStats.followerCount === "number"
        ? found.socialStats.followerCount
        : 0,
    followingCount:
      found.socialStats && typeof found.socialStats.followingCount === "number"
        ? found.socialStats.followingCount
        : 0,
    aboutText,
    isSuspended: found.isSuspended === true,
  };
}

// Initial home stories from Apollo homepagePostsConnection (rich fields).
function extractApolloStories() {
  const st = window.__APOLLO_STATE__;
  const out = [];
  const userKeys = Object.keys(st).filter((k) => k.startsWith("User:"));
  // only the profile owner carries a homepagePostsConnection
  for (const k of userKeys) {
    const u = st[k];
    const connKey = Object.keys(u).find(
      (f) =>
        f.startsWith("homepagePostsConnection") &&
        f.includes("includeDistributedResponses")
    );
    if (!connKey) continue;
    const conn = u[connKey];
    if (!conn || !Array.isArray(conn.posts)) continue;
    for (const ref of conn.posts) {
      if (!ref || !ref.__ref) continue;
      const p = st[ref.__ref];
      if (!p || p.__typename !== "Post") continue;
      let author = { name: "", username: "", profileUrl: "" };
      if (p.creator && p.creator.__ref && st[p.creator.__ref]) {
        const a = st[p.creator.__ref];
        author = {
          name: a.name || "",
          username: a.username || "",
          profileUrl: a.username ? "https://medium.com/@" + a.username : "",
        };
      }
      let publication = null;
      if (p.collection && p.collection.__ref && st[p.collection.__ref]) {
        const c = st[p.collection.__ref];
        publication = {
          name: c.name || "",
          slug: c.slug || "",
          url: c.slug ? "https://medium.com/" + c.slug : "",
        };
      }
      const tags = [];
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (t && t.__ref && st[t.__ref]) {
            tags.push(st[t.__ref].displayTitle || st[t.__ref].id || "");
          }
        }
      }
      out.push({
        postId: p.id || "",
        title: p.title || "",
        subtitle:
          (p.extendedPreviewContent && p.extendedPreviewContent.subtitle) || "",
        url: p.mediumUrl || "",
        author,
        publication,
        publishedAt:
          typeof p.firstPublishedAt === "number"
            ? new Date(p.firstPublishedAt).toISOString()
            : null,
        dateText: null,
        clapCount: typeof p.clapCount === "number" ? p.clapCount : 0,
        responseCount:
          p.postResponses && typeof p.postResponses.count === "number"
            ? p.postResponses.count
            : 0,
        readingTimeMinutes:
          typeof p.readingTime === "number" ? Math.round(p.readingTime) : null,
        tags,
        previewImageUrl:
          p.previewImage && p.previewImage.id
            ? "https://miro.medium.com/v2/resize:fit:400/" + p.previewImage.id
            : null,
        isMemberOnly: p.isLocked === true,
        isPinned: typeof p.pinnedAt === "number" && p.pinnedAt > 0,
        source: "apollo",
      });
    }
    break;
  }
  return out;
}

// ---------- section collectors (host side) ----------

// home / reposts: merge Apollo stories with scroll-loaded DOM cards.
async function collectStories(page, limit, apolloStories) {
  const seen = new Set();
  const items = [];
  for (const s of apolloStories) {
    if (s.postId && seen.has(s.postId)) continue;
    if (s.postId) seen.add(s.postId);
    items.push(s);
  }

  let staleRounds = 0;
  const maxScrolls = 60;
  for (let i = 0; i < maxScrolls && items.length < limit; i++) {
    const before = items.length;
    const cards = await page.$$('article[data-testid="post-preview"]');
    for (const card of cards) {
      if (items.length >= limit) break;
      const domItem = await card.evaluate(parseStoryCard).catch(() => null);
      if (!domItem) continue;
      const key = domItem.postId || domItem.url;
      if (key && seen.has(key)) continue;
      if (!domItem.postId && !domItem.title) continue; // malformed card
      if (key) seen.add(key);
      items.push(domItem);
    }
    if (items.length >= limit) break;
    await scrollDown(page);
    await humanPause(page, 700, 1300);
    staleRounds = items.length === before ? staleRounds + 1 : 0;
    if (staleRounds >= 4) break; // stream exhausted
  }

  const sliced = items.slice(0, limit);
  // partial only when the stream ended early with some items; empty is not partial
  return { items: sliced, partial: sliced.length > 0 && sliced.length < limit };
}

// activity: activity line + post-preview card pairs.
async function collectActivity(page, limit) {
  const items = [];
  const seen = new Set();
  let staleRounds = 0;
  const maxScrolls = 40;

  for (let i = 0; i < maxScrolls && items.length < limit; i++) {
    const before = items.length;
    const cards = await page.$$('article[data-testid="post-preview"]');
    for (const card of cards) {
      if (items.length >= limit) break;
      const meta = await card.evaluate(parseActivityLine).catch(() => null);
      const post = await card.evaluate(parseStoryCard).catch(() => null);
      if (!post) continue;
      const key =
        post.postId || post.url ||
        (meta ? meta.dateText + ":" + meta.action + ":" + post.title : post.title);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      items.push({
        action: meta && meta.action ? meta.action : null,
        actor: meta && meta.actor ? meta.actor : null,
        dateText: (meta && meta.dateText) || post.dateText || null,
        post,
      });
    }
    if (items.length >= limit) break;

    // explicit end-of-stream marker on the activity tab
    const caughtUp = await page.evaluate(() =>
      /caught up/i.test(document.body ? document.body.innerText : "")
    );
    if (caughtUp) break;

    await scrollDown(page);
    await humanPause(page, 700, 1300);
    staleRounds = items.length === before ? staleRounds + 1 : 0;
    if (staleRounds >= 4) break;
  }

  const sliced = items.slice(0, limit);
  return { items: sliced, partial: sliced.length < limit && sliced.length > 0 };
}

// lists: div[data-testid="readingList"] cards.
async function collectLists(page, limit) {
  const items = [];
  const seen = new Set();
  let staleRounds = 0;
  const maxScrolls = 30;

  for (let i = 0; i < maxScrolls && items.length < limit; i++) {
    const before = items.length;
    const cards = await page.$$('[data-testid="readingList"]');
    for (const c of cards) {
      if (items.length >= limit) break;
      const l = await c.evaluate((el) => {
        const nameEl = el.querySelector('[data-testid="readingListName"]');
        const linkEl = el.querySelector('a[href*="/list/"]');
        let url = "";
        if (linkEl) {
          try {
            url = new URL(linkEl.getAttribute("href"), location.href).href.split("?")[0];
          } catch (e) {
            url = "";
          }
        }
        const text = el.innerText || "";
        const m = text.match(/([\d,]+)\s+stor(y|ies)/i);
        const storyCount = m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
        const imgs = Array.from(el.querySelectorAll("img"))
          .map((im) => (im.getAttribute("src") || "").replace(/^http:\/\//, "https://"))
          // skip tiny author avatars (e.g. resize:fill:20:20)
          .filter((src) => {
            const rm = src.match(/resize:(?:fill|fit):(\d+)(?::(\d+))?/);
            if (!rm) return Boolean(src);
            return parseInt(rm[1], 10) * (rm[2] ? parseInt(rm[2], 10) : 1) >= 100 * 60;
          });
        return {
          name: nameEl ? nameEl.textContent.trim() : "",
          url,
          storyCount,
          previewImageUrls: imgs.slice(0, 3),
        };
      }).catch(() => null);
      if (!l) continue;
      const key = l.url || l.name;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      items.push(l);
    }
    if (items.length >= limit) break;
    await scrollDown(page);
    await humanPause(page, 700, 1200);
    staleRounds = items.length === before ? staleRounds + 1 : 0;
    if (staleRounds >= 3) break;
  }

  const sliced = items.slice(0, limit);
  return { items: sliced, partial: sliced.length < limit && sliced.length > 0 };
}

// ---------- main entry ----------
export default async (page, params, cwd) => {
  // 1. Parameter validation (before any page access)
  const rawUsername = (params.username || "").trim().replace(/^@/, "");
  if (!rawUsername) {
    throw throwCode("MISSING_PARAM", "--username is required (Medium username without the @ prefix).");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(rawUsername)) {
    throw throwCode("INVALID_PARAM", '--username contains invalid characters: "' + rawUsername + '".');
  }

  const section = (params.section || "").trim().toLowerCase();
  if (!VALID_SECTIONS.includes(section)) {
    throw throwCode(
      "INVALID_PARAM",
      '--section must be one of: ' + VALID_SECTIONS.join(" | ") + ', got: "' + params.section + '".'
    );
  }

  const limit = parseInt(params.limit, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    throw throwCode(
      "INVALID_PARAM",
      '--limit must be an integer between 1 and 100, got: "' + params.limit + '".'
    );
  }

  // 2. Navigate (subdomain redirects like @eve-arnold -> eve-arnold.medium.com
  //    are followed automatically by page.goto)
  const baseUrl = "https://medium.com/@" + rawUsername;
  const url = section === "home" ? baseUrl : baseUrl + "/" + section;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(page, 400, 900);
  await humanNudge(page);

  // 3. Fail-fast: 404 detection before waiting on content
  const bodyHasNotFound = await page.evaluate(() =>
    /PAGE NOT FOUND/i.test(document.body ? document.body.innerText : "")
  );
  if (bodyHasNotFound) {
    throw throwCode("NOT_FOUND", 'Medium user "@' + rawUsername + '" does not exist (page says PAGE NOT FOUND).');
  }

  // 4. Wait for Apollo state
  try {
    await page.waitForFunction(
      () => window.__APOLLO_STATE__ && Object.keys(window.__APOLLO_STATE__).length > 0,
      { timeout: 15000 }
    );
  } catch {
    throw throwCode("PAGE_LOAD_FAILED", "Apollo state did not hydrate within 15s on " + url);
  }

  // 5. Profile metadata
  const profile = await page.evaluate(extractProfile, rawUsername);
  if (profile.__notFound) {
    throw throwCode(
      "NOT_FOUND",
      'No profile found for "@' + rawUsername + '" (no matching User node; ' +
        profile.userNodeCount + " User nodes in page state)."
    );
  }
  if (profile.isSuspended) {
    throw throwCode("NOT_FOUND", 'Medium account "@' + rawUsername + '" is suspended.');
  }

  const result = {
    username: profile.username,
    name: profile.name,
    bio: profile.bio,
    avatarUrl: profile.imageId
      ? "https://miro.medium.com/v2/resize:fill:176:176/" + profile.imageId
      : null,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    profileUrl: "https://medium.com/@" + profile.username,
    section,
  };

  // 6. Section content
  if (section === "about") {
    // about = long-form bio; limit intentionally ignored
    let aboutText = profile.aboutText;
    if (!aboutText) {
      // DOM fallback: full text of the about page body
      aboutText = await page.evaluate(() => {
        const main = document.querySelector("main");
        return main ? main.innerText.trim() : "";
      });
    }
    result.about = aboutText;
    await humanPause(page, 200, 500);
    return result;
  }

  if (section === "lists") {
    const lists = await collectLists(page, limit);
    result.lists = lists.items;
    if (lists.partial) result.partial = true;
    await humanPause(page, 200, 600);
    return result;
  }

  if (section === "home" || section === "reposts") {
    // reposts has no Apollo connection; home contributes the first ~10 rich items
    const apolloStories = section === "home" ? await page.evaluate(extractApolloStories) : [];
    const stories = await collectStories(page, limit, apolloStories);
    result.stories = stories.items;
    if (stories.partial) result.partial = true;
    await humanPause(page, 200, 600);
    return result;
  }

  if (section === "activity") {
    const entries = await collectActivity(page, limit);
    result.entries = entries.items;
    if (entries.partial) result.partial = true;
    await humanPause(page, 200, 600);
    return result;
  }

  // unreachable — section validated above
  throw throwCode("INVALID_PARAM", "Unsupported section: " + section);
};
