// instagram/get-profile — fetch an Instagram profile header + one content tab grid.
// Data path (verified in explore): first-party GraphQL POST to /graphql/query.
// Profile header always fires on any tab page load. Each tab has its own initial
// query and a pagination variant driven by an after/max_id cursor.

const MAX_LIMIT = 100;
const IG_APP_ID = "936619743392459";
const GRAPHQL_URL = "/graphql/query";
const PROFILE_FRIENDLY = "PolarisProfilePageContentQuery";

const MEDIA_TYPE_TO_KIND = { 1: "image", 2: "video", 8: "carousel" };

const POSTS_DATA = {
  count: 12,
  include_reel_media_seen_timestamp: true,
  include_relationship_info: true,
  latest_besties_reel_media: true,
  latest_reel_media: true
};
const REELS_DATA = { include_feed_video: true, page_size: 12 };

const TABS = {
  posts: {
    path: "",
    initialFriendly: "PolarisProfilePostsQuery",
    pagFriendly: "PolarisProfilePostsTabContentQuery_connection",
    pagDocId: "27698568663128134",
    makePagVars: (ctx, cursor) => ({
      after: cursor,
      before: null,
      data: POSTS_DATA,
      first: 12,
      include_multi_captions: true,
      last: null,
      username: ctx.username,
      __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
      __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false
    }),
    parse: (json, tab) => {
      const conn = json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
      if (!conn || !Array.isArray(conn.edges)) return null;
      return {
        items: conn.edges.map((e) => normalizeMedia(e?.node, tab)),
        cursor: conn.page_info?.end_cursor || null,
        hasMore: !!conn.page_info?.has_next_page
      };
    }
  },
  reels: {
    path: "reels/",
    initialFriendly: "PolarisProfileReelsTabContentQuery",
    pagFriendly: "PolarisProfileReelsTabContentQuery_connection",
    pagDocId: "28143376935350124",
    makePagVars: (ctx, cursor) => ({
      after: cursor,
      data: { ...REELS_DATA, target_user_id: ctx.userId },
      first: 5,
      id: ctx.userId,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false
    }),
    parse: (json, tab) => {
      // 2026-08-23 drift: Instagram moved the reels root under
      // fetch__XDTUserDict.clips_connection; keep the older direct root as a
      // fallback in case a session is still served the previous shape.
      const conn =
        json?.data?.fetch__XDTUserDict?.clips_connection ||
        json?.data?.xdt_api__v1__clips__user__connection_v2;
      if (!conn || !Array.isArray(conn.edges)) return null;
      return {
        items: conn.edges.map((e) => normalizeMedia(e?.node?.media, tab)),
        cursor: conn.page_info?.end_cursor || null,
        hasMore: !!conn.page_info?.has_next_page
      };
    }
  },
  reposts: {
    path: "reposts/",
    initialFriendly: "PolarisProfileRepostsTabContentQuery",
    pagFriendly: "PolarisProfileRepostsTabContentRefetchQuery",
    pagDocId: "27999620666337672",
    makePagVars: (ctx, cursor) => ({
      max_id: cursor,
      id: ctx.userId,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false
    }),
    parse: (json, tab) => {
      const tl = json?.data?.fetch__XDTUserDict?.user_reposts_timeline;
      if (!tl || !Array.isArray(tl.repost_grid_items)) return null;
      return {
        items: tl.repost_grid_items.map((g) => normalizeMedia(g?.media, tab)),
        cursor: tl.repost_next_max_id || null,
        hasMore: !!tl.repost_more_available
      };
    }
  },
  tagged: {
    path: "tagged/",
    initialFriendly: "PolarisProfileTaggedTabContentQuery",
    pagFriendly: "PolarisProfileTaggedTabContentQuery_connection",
    pagDocId: "27391179227227772",
    makePagVars: (ctx, cursor) => ({
      after: cursor,
      before: null,
      count: 12,
      first: 12,
      last: null,
      user_id: ctx.userId,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false
    }),
    parse: (json, tab) => {
      const conn = json?.data?.xdt_api__v1__usertags__user_id__feed_connection;
      if (!conn || !Array.isArray(conn.edges)) return null;
      return {
        items: conn.edges.map((e) => normalizeMedia(e?.node, tab)),
        cursor: conn.page_info?.end_cursor || null,
        hasMore: !!conn.page_info?.has_next_page
      };
    }
  }
};

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function normalizeMedia(node, tab) {
  if (!node) return null;
  const code = node.code || null;
  const mediaType = Number(node.media_type) || null;
  const kind = MEDIA_TYPE_TO_KIND[mediaType] || null;
  const seg = mediaType === 2 ? "reel" : "p";
  let url = null;
  if (code) {
    if (tab === "reposts" && node.user?.username) {
      url = `https://www.instagram.com/${node.user.username}/${seg}/${code}/`;
    } else {
      url = `https://www.instagram.com/${seg}/${code}/`;
    }
  }
  return {
    shortcode: code,
    url,
    type: kind,
    caption: typeof node.caption === "string" ? node.caption : node.caption?.text || null,
    likeCount: node.like_count ?? null,
    commentCount: node.comment_count ?? null,
    timestamp: node.taken_at ?? null,
    thumbnail: node.image_versions2?.candidates?.[0]?.url || null
  };
}

function extractProfile(user) {
  return {
    username: user.username || null,
    name: user.full_name || null,
    bio: user.biography || null,
    externalUrl: user.external_url || null,
    avatar: user.hd_profile_pic_url_info?.url || user.profile_pic_url || null,
    postCount: user.media_count ?? null,
    followerCount: user.follower_count ?? null,
    followingCount: user.following_count ?? null,
    isVerified: !!user.is_verified,
    isPrivate: !!user.is_private
  };
}

function waitForQuery(page, friendly, timeout) {
  return page.waitForResponse(
    (response) => {
      const request = response.request();
      if (!request.url().includes("graphql")) return false;
      const header = request.headers()["x-fb-friendly-name"] || "";
      if (header === friendly) return true;
      const body = request.postData() || "";
      return body.includes(`fb_api_req_friendly_name=${friendly}`);
    },
    { timeout }
  );
}

async function waitRandom(page, min, max) {
  await page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

async function postGraphql(page, baseBody, friendly, docId, variables) {
  return page.evaluate(
    async ({ baseBody, friendly, docId, variables }) => {
      const body = new URLSearchParams(baseBody);
      body.set("fb_api_req_friendly_name", friendly);
      body.set("variables", JSON.stringify(variables));
      body.set("doc_id", docId);
      const csrfMatch = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
      const csrf = csrfMatch ? csrfMatch[1] : "";
      const headers = {
        "content-type": "application/x-www-form-urlencoded",
        "x-ig-app-id": "936619743392459",
        "x-fb-friendly-name": friendly
      };
      if (csrf) headers["x-csrftoken"] = csrf;
      const lsd = body.get("lsd");
      if (lsd) headers["x-fb-lsd"] = lsd;
      const response = await fetch("/graphql/query", {
        method: "POST",
        credentials: "include",
        headers,
        body: body.toString()
      });
      const text = await response.text();
      return JSON.parse(text);
    },
    { baseBody, friendly, docId, variables }
  );
}

function mergeItems(target, seen, items) {
  for (const item of items) {
    if (!item) continue;
    const key = item.shortcode;
    if (key && !seen.has(key)) {
      seen.add(key);
      target.push(item);
    }
  }
}

export default async (page, params, cwd) => {
  const user = typeof params.user === "string" ? params.user.trim() : "";
  if (!user) fail("MISSING_PARAM", "user is required");

  const tab = String(params.tab || "posts").toLowerCase();
  if (!TABS[tab]) fail("INVALID_PARAM", `tab must be one of ${Object.keys(TABS).join(", ")}`);

  const rawLimit = String(params.limit ?? "20").trim();
  if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

  const cfg = TABS[tab];
  const url = `https://www.instagram.com/${user}/${cfg.path}`;

  // IMPORTANT: tabRespPromise gets .catch(() => null) at creation so its 15s timeout
  // rejection can never become an unhandled rejection. When the profile query fails
  // (NOT_FOUND path), this function exits early and never awaits tabRespPromise — without
  // the catch, the abandoned promise would fire-and-forget and its rejection would bubble
  // to the daemon's unhandledRejection handler and crash the shared daemon, disconnecting
  // every concurrent browser session. profileRespPromise is always awaited (try/catch
  // below) so it needs no such guard.
  const profileRespPromise = waitForQuery(page, PROFILE_FRIENDLY, 15000);
  const tabRespPromise = waitForQuery(page, cfg.initialFriendly, 15000).catch(() => null);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

  let profileResp;
  try {
    profileResp = await profileRespPromise;
  } catch (error) {
    fail("NOT_FOUND", `no profile response for user "${user}" — the account may not exist or requires login`);
  }

  const profileJson = await profileResp.json();
  const userData = profileJson?.data?.user;
  if (!userData) fail("NOT_FOUND", `user "${user}" not found or profile data missing`);

  const profile = extractProfile(userData);
  const ctx = { username: userData.username, userId: userData.id || userData.pk };

  // tabRespPromise resolves to the Response or null (its rejection is swallowed above).
  let tabResp = await tabRespPromise;
  if (!tabResp) {
    if (profile.isPrivate) {
      return { profile, posts: [], partial: true, reason: "private" };
    }
    fail("DRIFT_DETECTED", `initial ${cfg.initialFriendly} query did not respond for user "${user}"`);
  }
  let firstPage;
  try {
    const tabJson = await tabResp.json();
    firstPage = cfg.parse(tabJson, tab);
  } catch (error) {
    if (profile.isPrivate) {
      return { profile, posts: [], partial: true, reason: "private" };
    }
    fail("DRIFT_DETECTED", `initial ${cfg.initialFriendly} query failed for "${user}": ${error.message}`);
  }
  if (!firstPage) fail("DRIFT_DETECTED", `unexpected schema from ${cfg.initialFriendly}`);

  const initialBody = tabResp.request().postData();
  const collected = [];
  const seen = new Set();
  mergeItems(collected, seen, firstPage.items);

  let cursor = firstPage.cursor;
  let hasMore = firstPage.hasMore;
  let pagesFetched = 1;
  const seenCursors = new Set();
  let paginationError = null;

  while (collected.length < limit && cursor && hasMore && initialBody && pagesFetched < 20 && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);
    await waitRandom(page, 1500, 3000);
    const variables = cfg.makePagVars(ctx, cursor);
    let pageData = null;
    try {
      const json = await postGraphql(page, initialBody, cfg.pagFriendly, cfg.pagDocId, variables);
      pageData = cfg.parse(json, tab);
    } catch (error) {
      paginationError = error instanceof Error ? error.message : String(error);
      break;
    }
    if (!pageData) {
      paginationError = "pagination schema missing";
      break;
    }
    mergeItems(collected, seen, pageData.items);
    cursor = pageData.cursor;
    hasMore = pageData.hasMore;
    pagesFetched += 1;
  }

  const output = {
    profile,
    posts: collected.slice(0, limit),
    partial: collected.length < limit,
    pagesFetched
  };
  if (paginationError) output.paginationError = paginationError;
  return output;
};
