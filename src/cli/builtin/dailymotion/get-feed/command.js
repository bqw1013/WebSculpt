// dailymotion/get-feed — fetch the logged-in user's homepage "Discover" (发现) feed.
// Personalized, region-localized video stream. No public API equivalent:
// the internal GraphQL endpoint requires the user's access_token (anonymous → 401).
// Feed is a FIXED batch of 40 cards — no infinite scroll, no cursor pagination.
// Primary path: page-internal GraphQL SEARCH_DISCOVERY_QUERY (validated in explore).
// Fallback path: DOM extraction of the masonry feed (same order as GraphQL).

const FEED_MAX = 40;
const MAX_LIMIT = 100;
const HOMEPAGE = 'https://www.dailymotion.com/';
const GQL_ENDPOINT = 'https://api.dailymotion.com/v1/graphql';

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Light pointer nudge to keep a polite pacing profile.
async function lightHumanize(page) {
  try {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (page.mouse && viewport.width > 0 && viewport.height > 0) {
      await page.mouse.move(
        Math.floor(viewport.width * (0.3 + Math.random() * 0.4)),
        Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
        { steps: randomBetween(2, 4) }
      );
    }
  } catch {
    // Pointer nudges are best effort and never block extraction.
  }
}

function ago(iso) {
  if (!iso) return null;
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function buildFeedQuery(first) {
  return `query SEARCH_DISCOVERY_QUERY($shouldQueryFeaturedVideos: Boolean!) {
  featuredVideos: conversations(filter: {story: {in: [VIDEO]}, algorithm: {eq: PERSONALIZED}}, first: ${first}) @include(if: $shouldQueryFeaturedVideos) {
    edges {
      node {
        id
        story {
          __typename
          ...SEARCH_DISCOVERY_VIDEO_FRAGMENT
        }
        __typename
      }
      __typename
    }
  }
}
fragment SEARCH_DISCOVERY_VIDEO_FRAGMENT on Video {
  id
  xid
  title
  isPublished
  embedURL
  thumbnailx240: thumbnailURL(size: "x240")
  createdAt
  channel {
    id
    xid
    name
    displayName
    accountType
    isFollowed
    __typename
  }
  duration
  aspectRatio
  __typename
}`;
}

function mapGraphqlVideo(v) {
  return {
    id: v.xid || null,
    title: v.title || null,
    url: v.xid ? `https://www.dailymotion.com/video/${v.xid}` : null,
    duration: v.duration != null ? v.duration : null,
    thumbnail: v.thumbnailx240 || null,
    owner: v.channel ? v.channel.displayName : null,
    ownerVerified: v.channel ? v.channel.accountType : null,
    createdAt: v.createdAt || null,
    publishedAgo: ago(v.createdAt),
    aspectRatio: v.aspectRatio != null ? v.aspectRatio : null
  };
}

// Page-internal GraphQL fetch: reads access_token from document.cookie and
// POSTs SEARCH_DISCOVERY_QUERY. Runs inside the browser context so the
// user's session is reused; the anonymous endpoint returns 401.
async function fetchFeedViaGraphql(page, first) {
  return page.evaluate(
    async ({ endpoint, query, variables }) => {
      const cookie = document.cookie
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('access_token='));
      if (!cookie) return { ok: false, reason: 'NO_TOKEN' };
      const token = decodeURIComponent(cookie.slice('access_token='.length));
      let resp;
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            operationName: 'SEARCH_DISCOVERY_QUERY',
            variables,
            query
          })
        });
      } catch (e) {
        return { ok: false, reason: 'FETCH_ERROR', message: String(e) };
      }
      const status = resp.status;
      let json = null;
      try {
        json = await resp.json();
      } catch {
        // Non-JSON body — handled below.
      }
      if (status === 401) return { ok: false, reason: 'UNAUTHORIZED', status };
      if (!json || !json.data || !json.data.featuredVideos || !Array.isArray(json.data.featuredVideos.edges)) {
        return { ok: false, reason: 'BAD_RESPONSE', status, errors: json && json.errors ? json.errors : null };
      }
      return {
        ok: true,
        status,
        videos: json.data.featuredVideos.edges.map((e) => e.node.story).filter(Boolean)
      };
    },
    { endpoint: GQL_ENDPOINT, query: buildFeedQuery(first), variables: { shouldQueryFeaturedVideos: true } }
  );
}

// DOM fallback: extract the masonry feed cards exactly as rendered.
// Cards carry id/title/thumbnail/owner only (no duration / publish time in DOM).
async function fetchFeedViaDom(page) {
  await page.waitForSelector('ul[class*="PageLayout__masonry"]', { timeout: 20000 }).catch(() => {});
  await lightHumanize(page);
  await page.waitForTimeout(randomBetween(500, 900));
  return page.evaluate(() => {
    const abs = (href) => {
      if (!href) return null;
      try {
        return new URL(href, location.origin).toString();
      } catch {
        return null;
      }
    };
    const cards = [];
    const seen = new Set();
    for (const li of document.querySelectorAll('ul[class*="PageLayout__masonry"] > li')) {
      const videoLink = li.querySelector('a[href*="/video/"]');
      if (!videoLink) continue;
      const href = videoLink.getAttribute('href');
      const xid = href ? href.split('/').filter(Boolean).pop() : null;
      if (!xid || seen.has(xid)) continue;
      seen.add(xid);
      const titleEl = li.querySelector('a[class*="videoTitle"] h2[title]') || li.querySelector('a[class*="videoTitle"]');
      const thumbImg = videoLink.querySelector('img');
      const ownerEl = li.querySelector('[class*="videoChannelName"]');
      cards.push({
        id: xid,
        title: titleEl ? titleEl.getAttribute('title') || titleEl.textContent.trim() : null,
        url: abs(href),
        duration: null,
        thumbnail: thumbImg ? thumbImg.currentSrc || thumbImg.src || null : null,
        owner: ownerEl ? ownerEl.textContent.trim() : null,
        ownerVerified: null,
        createdAt: null,
        publishedAgo: null,
        aspectRatio: null
      });
    }
    return cards;
  });
}

export default async (page, params, cwd) => {
  // ---- Resolve limit ----
  const rawLimit = params.limit == null ? '' : String(params.limit).trim();
  let limit = 20;
  if (rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) {
      fail('INVALID_PARAM', 'limit must be a positive integer between 1 and 100');
    }
    limit = Number(rawLimit);
    if (limit > MAX_LIMIT) fail('LIMIT_EXCEEDED', `limit cannot exceed ${MAX_LIMIT}`);
  }

  // ---- Load the homepage (redirects to the region locale, e.g. /ca) ----
  try {
    await page.goto(HOMEPAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    // The homepage is heavy; a slow load should not abort the GraphQL path.
    await sleep(1500);
  }
  // Keep the tab in the foreground so lazy rendering is not throttled.
  await page.bringToFront().catch(() => {});
  await sleep(randomBetween(800, 1600));

  // ---- Primary: page-internal GraphQL (validated in explore) ----
  const requested = Math.min(limit, FEED_MAX);
  let items = null;
  let source = null;
  let graphqlAuthError = null;
  try {
    const feed = await fetchFeedViaGraphql(page, requested);
    if (feed.ok) {
      items = feed.videos.map(mapGraphqlVideo);
      source = 'graphql';
    } else if (feed.reason === 'NO_TOKEN' || feed.reason === 'UNAUTHORIZED') {
      graphqlAuthError = feed.reason;
    }
  } catch (e) {
    graphqlAuthError = e;
  }

  // ---- Fallback: DOM extraction ----
  if (items === null) {
    const domCards = await fetchFeedViaDom(page).catch(() => []);
    if (domCards.length > 0) {
      items = domCards;
      source = 'dom';
    }
  }

  if (items === null) {
    if (graphqlAuthError) {
      fail('AUTH_REQUIRED', 'Dailymotion login required — the Discover feed is personalized and returns 401 without a logged-in session. Open the browser to dailymotion.com while logged in, then retry.');
    }
    fail('DRIFT_DETECTED', 'Homepage Discover feed container (ul.PageLayout__masonry) not found and the feed GraphQL query failed.');
  }

  const sliced = items.slice(0, limit);
  const partial = sliced.length < limit;
  return { items: sliced, count: sliced.length, partial, source };
};
