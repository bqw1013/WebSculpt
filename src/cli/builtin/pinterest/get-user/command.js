// pinterest/get-user — fetch a Pinterest user's public profile plus one content tab
// (saved = boards grid, created = original pins stream).
// Data comes from the page's own XHR to /resource/*/get/ endpoints (UserResource,
// BoardsResource, UserActivityPinsResource), captured via page.waitForResponse.
// Raw in-page fetch to those endpoints is NOT used (needs internal auth).

const MAX_LIMIT = 100;

function errorWithCode(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw errorWithCode("INVALID_PARAM", "limit must be a positive integer (1-100)");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a safe integer");
  }
  if (limit > MAX_LIMIT) {
    throw errorWithCode("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }
  return limit;
}

// Parse a localized count like "31.6 万 位粉丝" (zh, ten-thousands) into a number.
function parseLocalizedCount(text) {
  if (!text) return null;
  const wan = text.match(/([\d.,]+)\s*万/);
  if (wan) return Math.round(parseFloat(wan[1].replace(/,/g, "")) * 10000);
  const plain = text.match(/([\d.,]+)/);
  return plain ? parseInt(plain[1].replace(/,/g, ""), 10) : null;
}

// True when a resource response URL belongs to <endpoint> for the target <username>,
// optionally requiring an extra JSON fragment (e.g. '"field_set_key":"profile"').
function urlIsResourceForUser(url, endpoint, username, extra) {
  if (!url.includes(`/resource/${endpoint}/get/`)) return false;
  let dec;
  try {
    dec = decodeURIComponent(url);
  } catch {
    return false;
  }
  if (!dec.includes(`"username":"${username}"`)) return false;
  if (extra && !dec.includes(extra)) return false;
  return true;
}

function sleep(page, ms) {
  return page.waitForTimeout(ms);
}

// Polite pacing scroll: random offset, random mouse move, short randomized wait (200-500ms).
async function gentleScroll(page) {
  const delta = 500 + Math.floor(Math.random() * 600);
  await page.evaluate((d) => window.scrollBy(0, d), delta);
  await page
    .mouse.move(rand(100, 900), rand(100, 500))
    .catch(() => null);
  await sleep(page, rand(200, 500));
}

function mapBoard(b) {
  // The boards feed's first page includes a type=story "All Pins" card — skip it.
  if (!b || b.type !== "board") return null;
  return {
    key: b.id,
    obj: {
      name: b.name || null,
      url: b.url ? `https://www.pinterest.com${b.url}` : null,
      pinCount: typeof b.pin_count === "number" ? b.pin_count : null,
      lastUpdated: b.board_order_modified_at || null,
      owner: {
        username: (b.owner && b.owner.username) || null,
        displayName: (b.owner && b.owner.full_name) || null
      },
      isCollaborative: Boolean(b.is_collaborative)
    }
  };
}

function mapPin(p) {
  const img =
    (p.images && (p.images.orig || p.images["736x"] || p.images["236x"])) || null;
  // Some pins have empty title/grid_title; fall back to the first sentence of the description.
  let title = p.title || p.grid_title || null;
  if (!title && p.description) {
    const first = String(p.description).split(/[.!?。！？]|\n/)[0].trim();
    if (first) title = first.slice(0, 200);
  }
  return {
    key: p.id,
    obj: {
      id: p.id,
      title: title,
      imageUrl: (img && img.url) || null,
      pinUrl: p.id ? `https://www.pinterest.com/pin/${p.id}/` : null
    }
  };
}

// Ingest one resource response into `items` (dedup by key). Returns next bookmark.
async function ingestResponse(resp, mapFn, items, seen) {
  let json;
  try {
    json = await resp.json();
  } catch {
    return null;
  }
  const rr = json && json.resource_response;
  const data = (rr && rr.data) || [];
  if (Array.isArray(data)) {
    for (const it of data) {
      const mapped = mapFn(it);
      if (mapped && mapped.key && !seen.has(mapped.key)) {
        seen.add(mapped.key);
        items.push(mapped.obj);
      }
    }
  }
  return rr ? rr.bookmark || null : null;
}

// Drive scroll pagination until `limit` items are collected or the feed is exhausted.
// The first page response is `firstResp` (or null). `isUrl` matches subsequent pages.
async function collectPagedContent(page, firstResp, limit, isUrl, mapFn) {
  const items = [];
  const seen = new Set();
  let bookmark = null;

  if (firstResp) {
    bookmark = await ingestResponse(firstResp, mapFn, items, seen);
  }

  let guard = 0;
  // Arm the next wait BEFORE scrolling so an auto-fired next page is not missed.
  let pending =
    items.length < limit && bookmark
      ? page.waitForResponse((r) => isUrl(r), { timeout: 12000 }).catch(() => null)
      : null;

  while (pending && guard < 8) {
    guard += 1;
    try {
      await gentleScroll(page);
    } catch {
      pending = null;
      break;
    }
    const resp = await pending;
    pending = null;
    if (!resp) {
      // Possible throttle / rate signal: back off longer, then retry once.
      await sleep(page, 900 + rand(0, 600));
      if (items.length < limit && guard < 8) {
        pending = page
          .waitForResponse((r) => isUrl(r), { timeout: 12000 })
          .catch(() => null);
      }
      continue;
    }
    bookmark = await ingestResponse(resp, mapFn, items, seen);
    if (items.length >= limit || !bookmark) {
      pending = null;
      break;
    }
    pending = page
      .waitForResponse((r) => isUrl(r), { timeout: 12000 })
      .catch(() => null);
  }

  const partial = items.length < limit;
  return { items: items.slice(0, limit), partial };
}

export default async (page, params, cwd) => {
  const username = String(params.username || "").trim();
  if (!username) throw errorWithCode("MISSING_PARAM", "username is required");

  const tab = params.tab === "created" ? "created" : "saved";
  const limit = parseLimit(params.limit);

  const profileUrl =
    tab === "created"
      ? `https://www.pinterest.com/${encodeURIComponent(username)}/_created/`
      : `https://www.pinterest.com/${encodeURIComponent(username)}/`;

  // Arm response watchers BEFORE navigation (fresh page per execution).
  const profileRespPromise = page
    .waitForResponse(
      (r) =>
        urlIsResourceForUser(r.url(), "UserResource", username, '"field_set_key":"profile"'),
      { timeout: 20000 }
    )
    .catch(() => null);

  const contentPredicate =
    tab === "saved"
      ? (r) =>
          urlIsResourceForUser(
            r.url(),
            "BoardsResource",
            username,
            '"field_set_key":"profile_grid_item"'
          )
      : (r) =>
          urlIsResourceForUser(r.url(), "UserActivityPinsResource", username, null);

  const contentRespPromise = page
    .waitForResponse(contentPredicate, { timeout: 20000 })
    .catch(() => null);

  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

  // --- NOT_FOUND detection ---
  if (page.url().includes("show_error=true")) {
    throw errorWithCode(
      "NOT_FOUND",
      `Pinterest user "${username}" was not found (redirected to error page)`
    );
  }
  const profileNamePresent = await page
    .locator("[data-test-id=profile-name]")
    .first()
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!profileNamePresent) {
    throw errorWithCode(
      "NOT_FOUND",
      `Pinterest user "${username}" was not found or the profile did not render`
    );
  }

  // --- Profile (API first, SSR DOM fallback) ---
  let profile = null;
  const profileResp = await profileRespPromise;
  if (profileResp) {
    let json;
    try {
      json = await profileResp.json();
    } catch {
      json = null;
    }
    const d = json && json.resource_response && json.resource_response.data;
    if (d) {
      profile = {
        username: d.username || username,
        displayName: d.full_name || null,
        bio: d.about || null,
        avatarUrl: d.image_xlarge_url || d.image_medium_url || null,
        followersCount: typeof d.follower_count === "number" ? d.follower_count : null,
        followingCount: typeof d.following_count === "number" ? d.following_count : null,
        monthlyViews: typeof d.profile_views === "number" ? d.profile_views : null,
        externalLinks: [],
        profileUrl: `https://www.pinterest.com/${d.username || username}/`
      };
    }
  }

  if (!profile) {
    const dom = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const text = (s) => {
        const n = q(s);
        return n ? n.textContent.trim() : null;
      };
      const avatarImg = q("[data-test-id=gestalt-avatar-svg] img");
      return {
        username: text("[data-test-id=profile-username]"),
        displayName: text("[data-test-id=profile-name]"),
        bio: text("[data-test-id=main-user-description-text]"),
        avatarUrl: avatarImg ? avatarImg.currentSrc || avatarImg.src || null : null,
        followersText: text("[data-test-id=profile-followers-count]"),
        followingText: text("[data-test-id=profile-following-count]")
      };
    });
    profile = {
      username: dom.username || username,
      displayName: dom.displayName,
      bio: dom.bio,
      avatarUrl: dom.avatarUrl,
      followersCount: parseLocalizedCount(dom.followersText),
      followingCount: parseLocalizedCount(dom.followingText),
      monthlyViews: null,
      externalLinks: [],
      profileUrl: `https://www.pinterest.com/${dom.username || username}/`
    };
  }

  // External links (website / social) come from the profile header anchors.
  const externalLinks = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("[data-test-id=profile-header] a[href^=http]")]
      .map((a) => a.href)
      .filter(Boolean);
    const seen = new Set();
    return hrefs.filter((h) => !seen.has(h) && seen.add(h));
  });
  profile.externalLinks = externalLinks;

  // --- Tab content ---
  let boards = [];
  let pins = [];
  let partial = false;

  if (tab === "saved") {
    const gridPresent = await page
      .locator("[data-test-id=profile-board-card]")
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (gridPresent) {
      const contentResp = await contentRespPromise;
      const collected = await collectPagedContent(
        page,
        contentResp,
        limit,
        (r) =>
          urlIsResourceForUser(
            r.url(),
            "BoardsResource",
            username,
            '"field_set_key":"profile_grid_item"'
          ),
        mapBoard
      );
      boards = collected.items;
      partial = collected.partial;
    } else {
      partial = true;
    }
  } else {
    const feedPresent = await page
      .locator("[data-test-id=pin]")
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (feedPresent) {
      const contentResp = await contentRespPromise;
      const collected = await collectPagedContent(
        page,
        contentResp,
        limit,
        (r) => urlIsResourceForUser(r.url(), "UserActivityPinsResource", username, null),
        mapPin
      );
      pins = collected.items;
      partial = collected.partial;
    } else {
      partial = true;
    }
  }

  const result = {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    followersCount: profile.followersCount,
    followingCount: profile.followingCount,
    monthlyViews: profile.monthlyViews,
    externalLinks: profile.externalLinks,
    profileUrl: profile.profileUrl,
    tab
  };

  if (tab === "saved") {
    result.boards = boards;
    result.count = boards.length;
  } else {
    result.pins = pins;
    result.count = pins.length;
  }
  result.partial = partial;

  return result;
};
