// dailymotion/search — search Dailymotion by keyword (browser runtime).
// Primary path: in-page fetch of SEARCH_QUERY against https://search.dailymotion.com/v1
// using the browser session's access_token + dmaid cookies. Falls back to visible DOM.
const MAX_LIMIT = 100;
const SEARCH_API = 'https://search.dailymotion.com/v1';
const APP_VERSION = 'v2026-08-13T15:59:39.580Z';

const SEARCH_QUERY = `fragment VIDEO_BASE_FRAGMENT on Video {
  id
  xid
  title
  createdAt
  duration
  aspectRatio
  thumbnail(height: PORTRAIT_240) {
    id
    url
    __typename
  }
  creator {
    id
    xid
    name
    displayName
    accountType
    avatar(height: SQUARE_60) {
      id
      url
      __typename
    }
    __typename
  }
  __typename
}

fragment CHANNEL_BASE_FRAG on Channel {
  id
  xid
  name
  displayName
  accountType
  isFollowed
  avatar(height: SQUARE_120) {
    id
    url
    __typename
  }
  followerEngagement {
    id
    followDate
    __typename
  }
  metrics {
    id
    engagement {
      id
      followers {
        edges {
          node {
            id
            total
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment PLAYLIST_BASE_FRAG on Collection {
  id
  xid
  name
  thumbnail(height: PORTRAIT_240) {
    id
    url
    __typename
  }
  creator {
    id
    xid
    name
    displayName
    accountType
    avatar(height: SQUARE_60) {
      id
      url
      __typename
    }
    __typename
  }
  metrics {
    id
    engagement {
      id
      videos(filter: {visibility: {eq: PUBLIC}}) {
        edges {
          node {
            id
            total
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment HASHTAG_BASE_FRAG on Hashtag {
  id
  xid
  name
  metrics {
    id
    engagement {
      id
      videos {
        edges {
          node {
            id
            total
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment LIVE_BASE_FRAGMENT on Live {
  id
  xid
  title
  audienceCount
  aspectRatio
  isOnAir
  thumbnail(height: PORTRAIT_240) {
    id
    url
    __typename
  }
  creator {
    id
    xid
    name
    displayName
    accountType
    avatar(height: SQUARE_60) {
      id
      url
      __typename
    }
    __typename
  }
  __typename
}

query SEARCH_QUERY($query: String!, $shouldIncludeTopResults: Boolean!, $shouldIncludeVideos: Boolean!, $shouldIncludeChannels: Boolean!, $shouldIncludePlaylists: Boolean!, $shouldIncludeHashtags: Boolean!, $shouldIncludeLives: Boolean!, $page: Int, $limit: Int, $sortByVideos: SearchVideoSort, $durationMinVideos: Int, $durationMaxVideos: Int, $createdAfterVideos: DateTime) {
  search {
    id
    stories(query: $query, first: $limit, page: $page) @include(if: $shouldIncludeTopResults) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          ...VIDEO_BASE_FRAGMENT
          ...CHANNEL_BASE_FRAG
          ...PLAYLIST_BASE_FRAG
          ...HASHTAG_BASE_FRAG
          ...LIVE_BASE_FRAGMENT
          __typename
        }
        __typename
      }
      __typename
    }
    videos(
      query: $query
      first: $limit
      page: $page
      sort: $sortByVideos
      durationMin: $durationMinVideos
      durationMax: $durationMaxVideos
      createdAfter: $createdAfterVideos
    ) @include(if: $shouldIncludeVideos) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          ...VIDEO_BASE_FRAGMENT
          __typename
        }
        __typename
      }
      __typename
    }
    lives(query: $query, first: $limit, page: $page) @include(if: $shouldIncludeLives) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          ...LIVE_BASE_FRAGMENT
          __typename
        }
        __typename
      }
      __typename
    }
    channels(query: $query, first: $limit, page: $page) @include(if: $shouldIncludeChannels) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          ...CHANNEL_BASE_FRAG
          __typename
        }
        __typename
      }
      __typename
    }
    playlists: collections(query: $query, first: $limit, page: $page) @include(if: $shouldIncludePlaylists) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          ...PLAYLIST_BASE_FRAG
          __typename
        }
        __typename
      }
      __typename
    }
    hashtags(query: $query, first: $limit, page: $page) @include(if: $shouldIncludeHashtags) {
      metadata {
        id
        algorithm {
          uuid
          __typename
        }
        __typename
      }
      pageInfo {
        hasNextPage
        nextPage
        __typename
      }
      edges {
        node {
          id
          ...HASHTAG_BASE_FRAG
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

const TYPES = new Set(['video', 'top', 'user', 'playlist', 'live', 'hashtag']);
const TYPE_CONFIG = {
  video:    { path: 'videos',      section: 'videos',    flag: 'shouldIncludeVideos' },
  top:      { path: 'top-results', section: 'stories',    flag: 'shouldIncludeTopResults' },
  user:     { path: 'channels',    section: 'channels',   flag: 'shouldIncludeChannels' },
  playlist: { path: 'playlists',   section: 'playlists',  flag: 'shouldIncludePlaylists' },
  live:     { path: 'lives',       section: 'lives',      flag: 'shouldIncludeLives' },
  hashtag:  { path: 'hashtags',    section: 'hashtags',   flag: 'shouldIncludeHashtags' }
};
const SORTS = new Set(['relevance', 'recent', 'viewed']);
const SORT_MAP = { relevance: null, recent: 'RECENT', viewed: 'VIEW_COUNT' };
const TIMES = new Set(['all', 'day', 'week', 'month', 'year']);
const TIME_DAYS = { day: 1, week: 7, month: 30, year: 365 };

function fail(code, message) {
  const error = new Error('[' + code + '] ' + message);
  error.code = code;
  throw error;
}
function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function searchUrl(query, type) {
  return 'https://www.dailymotion.com/search/' + encodeURIComponent(query) + '/' + TYPE_CONFIG[type].path;
}
function firstMetricTotal(node) {
  try { return node.metrics.engagement.videos.edges[0].node.total || null; } catch { return null; }
}
function firstFollowerTotal(node) {
  try { return node.metrics.engagement.followers.edges[0].node.total || null; } catch { return null; }
}
function creatorOf(node) {
  if (!node.creator) return null;
  return {
    xid: node.creator.xid || null,
    name: node.creator.name || null,
    displayName: node.creator.displayName || null,
    avatar: (node.creator.avatar && node.creator.avatar.url) ? node.creator.avatar.url : null
  };
}
function thumbnailOf(node) {
  return (node.thumbnail && node.thumbnail.url) ? node.thumbnail.url : null;
}

function normalize(node, type) {
  const tn = String(node.__typename || '').toLowerCase();
  if (type === 'top') {
    if (tn === 'video') return normalize(node, 'video');
    if (tn === 'channel') return normalize(node, 'user');
    if (tn === 'collection') return normalize(node, 'playlist');
    if (tn === 'live') return normalize(node, 'live');
    if (tn === 'hashtag') return normalize(node, 'hashtag');
    return { kind: 'unknown', xid: node.xid || null, name: node.name || node.title || null };
  }
  if (type === 'video') {
    return {
      kind: 'video',
      xid: node.xid || null,
      title: node.title || null,
      url: node.xid ? 'https://www.dailymotion.com/video/' + node.xid : null,
      duration: node.duration ?? null,
      thumbnail: thumbnailOf(node),
      creator: creatorOf(node),
      createdAt: node.createdAt || null
    };
  }
  if (type === 'user') {
    const slug = node.name || node.xid || null;
    return {
      kind: 'user',
      xid: node.xid || null,
      name: node.name || node.displayName || null,
      displayName: node.displayName || node.name || null,
      url: slug ? 'https://www.dailymotion.com/user/' + slug : null,
      avatar: (node.avatar && node.avatar.url) ? node.avatar.url : null,
      followers: firstFollowerTotal(node),
      isFollowed: node.isFollowed ?? null,
      accountType: node.accountType || null
    };
  }
  if (type === 'playlist') {
    return {
      kind: 'playlist',
      xid: node.xid || null,
      name: node.name || null,
      url: node.xid ? 'https://www.dailymotion.com/playlist/' + node.xid : null,
      owner: creatorOf(node),
      videosTotal: firstMetricTotal(node),
      thumbnail: thumbnailOf(node)
    };
  }
  if (type === 'live') {
    return {
      kind: 'live',
      xid: node.xid || null,
      title: node.title || null,
      url: node.xid ? 'https://www.dailymotion.com/live/' + node.xid : null,
      thumbnail: thumbnailOf(node),
      audienceCount: node.audienceCount ?? null,
      isOnAir: node.isOnAir ?? null,
      creator: creatorOf(node)
    };
  }
  if (type === 'hashtag') {
    const name = node.name || null;
    return {
      kind: 'hashtag',
      name: name,
      url: name ? 'https://www.dailymotion.com/hashtag/' + encodeURIComponent(String(name).replace(/^#/, '')) : null,
      videosTotal: firstMetricTotal(node)
    };
  }
  return { kind: type, xid: node.xid || null, title: node.title || null, name: node.name || null };
}

function resultKey(rec) {
  return rec.kind + ':' + (rec.xid || rec.name || rec.title || rec.url || '');
}

async function apiPage(page, args) {
  return page.evaluate(async ({ searchApi, queryText, query, pageNum, requestLimit, sortVar, createdAfterVar, appVersion }) => {
    const getCookie = (name) => {
      const hit = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
      return hit ? hit.slice(name.length + 1) : null;
    };
    const token = getCookie('access_token') || getCookie('client_token');
    const dmaid = getCookie('dmaid');
    if (!token || !dmaid) return { error: 'NO_SESSION_COOKIE' };
    const cfg = {
      video: { section: 'videos', flag: 'shouldIncludeVideos' },
      top: { section: 'stories', flag: 'shouldIncludeTopResults' },
      user: { section: 'channels', flag: 'shouldIncludeChannels' },
      playlist: { section: 'playlists', flag: 'shouldIncludePlaylists' },
      live: { section: 'lives', flag: 'shouldIncludeLives' },
      hashtag: { section: 'hashtags', flag: 'shouldIncludeHashtags' }
    }[query.type];
    const variables = {
      query: query.q,
      page: pageNum,
      limit: requestLimit,
      shouldIncludeTopResults: false,
      shouldIncludeVideos: false,
      shouldIncludeChannels: false,
      shouldIncludePlaylists: false,
      shouldIncludeHashtags: false,
      shouldIncludeLives: false,
      sortByVideos: null,
      durationMinVideos: null,
      durationMaxVideos: null,
      createdAfterVideos: null
    };
    variables[cfg.flag] = true;
    if (sortVar) variables.sortByVideos = sortVar;
    if (createdAfterVar) variables.createdAfterVideos = createdAfterVar;
    const response = await fetch(searchApi, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': '*/*',
        'authorization': 'Bearer ' + token,
        'x-dm-visitor-id': dmaid.toUpperCase(),
        'x-dm-appinfo-type': 'website',
        'x-dm-appinfo-id': 'com.dailymotion.neon',
        'x-dm-appinfo-version': appVersion,
        'x-dm-preferred-country': 'ca',
        'x-dm-neon-ssr': '0'
      },
      body: JSON.stringify({ operationName: 'SEARCH_QUERY', variables, query: queryText })
    });
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      return { error: 'HTTP_' + response.status, raw: text.slice(0, 200) };
    }
    let body;
    try { body = JSON.parse(text); } catch { return { error: 'INVALID_JSON', raw: text.slice(0, 200) }; }
    const section = body.data && body.data.search && body.data.search[cfg.section];
    if (!section || !Array.isArray(section.edges)) {
      const msgs = (body.errors || []).map((e) => e.message).join('; ');
      return { error: msgs || 'MISSING_SECTION_' + cfg.section, section: cfg.section };
    }
    return { edges: section.edges, pageInfo: section.pageInfo || null };
  }, args);
}

async function readDomPage(page, type, limit) {
  const testid = (type === 'video' || type === 'top' || type === 'playlist' || type === 'live')
    ? 'video-card'
    : (type === 'user' ? 'channel-card' : 'hashtag-card');
  await page.waitForSelector('[data-testid="' + testid + '"]', { timeout: 8000 }).catch(() => {});
  await sleep(randomBetween(300, 700));
  return page.evaluate(({ requestedType, resultLimit }) => {
    const absolute = (v) => { try { return v ? new URL(v, location.origin).toString() : null; } catch { return null; } };
    const records = [];
    const seen = new Set();
    const add = (rec) => {
      const key = rec.kind + ':' + (rec.xid || rec.name || rec.title || '');
      if (!key || seen.has(key) || records.length >= resultLimit) return;
      seen.add(key);
      records.push(rec);
    };
    const imageOf = (card) => {
      const img = [...card.querySelectorAll('img')].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
      return (img && (img.currentSrc || img.src)) ? (img.currentSrc || img.src) : null;
    };
    const pickText = (card, hrefPrefix) => {
      const links = [...card.querySelectorAll('a[href^="' + hrefPrefix + '"]')].filter((a) => !a.hasAttribute('aria-hidden'));
      return links[0] || null;
    };
    if (requestedType === 'video' || requestedType === 'top' || requestedType === 'live') {
      for (const card of document.querySelectorAll('[data-testid="video-card"]')) {
        const link = pickText(card, '/video/');
        if (!link) continue;
        const channelLink = card.querySelector('a[href^="/user/"]');
        const pubDate = card.querySelector('span[title]') ? card.querySelector('span[title]').getAttribute('title') : null;
        add({
          kind: requestedType === 'live' ? 'live' : 'video',
          xid: (link.getAttribute('href') || '').split('/').filter(Boolean).pop() || null,
          title: link.getAttribute('title') || link.textContent.trim() || null,
          url: absolute(link.getAttribute('href')),
          duration: card.querySelector('[class*="videoDuration"]') ? card.querySelector('[class*="videoDuration"]').textContent.trim() : null,
          thumbnail: imageOf(card),
          creator: channelLink ? { xid: null, name: channelLink.textContent.trim(), displayName: channelLink.textContent.trim(), avatar: null } : null,
          createdAt: pubDate
        });
      }
    } else if (requestedType === 'playlist') {
      for (const card of document.querySelectorAll('[data-testid="video-card"]')) {
        const link = pickText(card, '/playlist/');
        if (!link) continue;
        const channelLink = card.querySelector('a[href^="/user/"]');
        const titleAttr = card.querySelector('[title]') ? card.querySelector('[title]').getAttribute('title') : null;
        add({
          kind: 'playlist',
          xid: (link.getAttribute('href') || '').split('/').filter(Boolean).pop() || null,
          name: link.getAttribute('title') || link.textContent.trim() || titleAttr || null,
          url: absolute(link.getAttribute('href')),
          owner: channelLink ? { xid: null, name: channelLink.textContent.trim(), displayName: channelLink.textContent.trim() } : null,
          videosTotal: null,
          thumbnail: imageOf(card)
        });
      }
    } else if (requestedType === 'user') {
      for (const card of document.querySelectorAll('[data-testid="channel-card"]')) {
        const link = card.querySelector('a[href^="/user/"][title]') || card.querySelector('a[href^="/user/"]');
        if (!link) continue;
        const nameText = link.getAttribute('title') || link.textContent.trim();
        const avatar = card.querySelector('img[src]') ? card.querySelector('img[src]').src : null;
        add({
          kind: 'user',
          xid: (link.getAttribute('href') || '').split('/').filter(Boolean).pop() || null,
          name: nameText || null,
          displayName: nameText || null,
          url: absolute(link.getAttribute('href')),
          avatar: avatar,
          followers: null,
          isFollowed: null,
          accountType: null
        });
      }
    } else if (requestedType === 'hashtag') {
      for (const card of document.querySelectorAll('[data-testid="hashtag-card"]')) {
        const h = card.querySelector('h4') ? card.querySelector('h4').textContent.trim() : null;
        if (!h) continue;
        const link = card.querySelector('a[href^="/hashtag/"]');
        add({
          kind: 'hashtag',
          name: h,
          url: link ? absolute(link.getAttribute('href')) : null,
          videosTotal: null
        });
      }
    }
    return records.slice(0, resultLimit);
  }, { requestedType: type, resultLimit: limit });
}

export default async (page, params, cwd) => {
  const query = typeof params.query === 'string' ? params.query.trim() : '';
  if (!query) fail('MISSING_PARAM', 'query is required');
  const type = String(params.type).toLowerCase();
  if (!TYPES.has(type)) fail('INVALID_PARAM', 'type must be one of ' + [...TYPES].join(', '));
  const rawLimit = String(params.limit).trim();
  if (!/^[0-9]+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit))) fail('INVALID_PARAM', 'limit must be a positive integer');
  const limit = Number(rawLimit);
  if (limit < 1) fail('INVALID_PARAM', 'limit must be >= 1');
  if (limit > MAX_LIMIT) fail('LIMIT_EXCEEDED', 'limit cannot exceed ' + MAX_LIMIT);
  const sort = String(params.sort).toLowerCase();
  if (!SORTS.has(sort)) fail('INVALID_PARAM', 'sort must be one of ' + [...SORTS].join(', '));
  const time = String(params.time).toLowerCase();
  if (!TIMES.has(time)) fail('INVALID_PARAM', 'time must be one of ' + [...TIMES].join(', '));

  const ignoredParams = [];
  if (type !== 'video' && type !== 'top' && sort !== 'relevance') ignoredParams.push('sort=' + sort);
  if (type !== 'video' && type !== 'top' && time !== 'all') ignoredParams.push('time=' + time);

  const sortVar = (type === 'video' || type === 'top') ? SORT_MAP[sort] : null;
  const createdAfterVar = ((type === 'video' || type === 'top') && TIME_DAYS[time])
    ? new Date(Date.now() - TIME_DAYS[time] * 86400000).toISOString()
    : null;

  const url = searchUrl(query, type);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

  const results = [];
  const seen = new Set();
  let pageNumber = 1;
  let partial = false;
  let apiError = null;

  try {
    for (let attempt = 0; attempt < 8 && results.length < limit; attempt += 1) {
      const data = await apiPage(page, {
        searchApi: SEARCH_API,
        queryText: SEARCH_QUERY,
        query: { q: query, type: type },
        pageNum: pageNumber,
        requestLimit: Math.min(20, limit),
        sortVar: sortVar,
        createdAfterVar: createdAfterVar,
        appVersion: APP_VERSION
      });
      if (data && data.error) {
        if (data.error === 'NO_SESSION_COOKIE') { apiError = data.error; break; }
        throw new Error(data.error + (data.raw ? ': ' + data.raw : ''));
      }
      if (!data || !Array.isArray(data.edges)) { apiError = 'EMPTY_API_RESPONSE'; break; }
      if (!data.edges.length) { partial = true; break; }
      for (const edge of data.edges) {
        const rec = normalize(edge.node, type);
        const key = resultKey(rec);
        if (key && !seen.has(key)) { seen.add(key); results.push(rec); }
      }
      const nextPage = Number(data.pageInfo && data.pageInfo.nextPage);
      if (!data.pageInfo || !data.pageInfo.hasNextPage || !Number.isInteger(nextPage) || nextPage === pageNumber) break;
      pageNumber = nextPage;
      await sleep(randomBetween(200, 700));
    }
    if (results.length >= limit) results.length = limit;
    else partial = true;
    const out = {
      query, type, limit, maxLimit: MAX_LIMIT, count: results.length, results, source: 'api'
    };
    if (partial) out.partial = true;
    if (ignoredParams.length) out.ignoredParams = ignoredParams;
    return out;
  } catch (error) {
    apiError = error instanceof Error ? error.message : String(error);
  }

  const domResults = await readDomPage(page, type, limit);
  if (!domResults.length) {
    fail('DRIFT_DETECTED', 'Dailymotion search API and DOM extraction failed: ' + (apiError || 'no visible results'));
  }
  const out = {
    query, type, limit, maxLimit: MAX_LIMIT, count: domResults.length, results: domResults,
    source: 'dom', fallbackUsed: true, partial: true, fallbackReason: apiError || 'API unavailable'
  };
  if (ignoredParams.length) out.ignoredParams = ignoredParams;
  return out;
};

