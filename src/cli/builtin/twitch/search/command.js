// twitch/search — search Twitch channels, categories, or videos by keyword via the internal GraphQL.
// Docs reference: the node runtime contract
// Explore evidence: verified 2026-08-17

const SHA256_HASH = "22d9f9b96e28afdcd918f1c5b93e87979c4673d29a851da7c823e0a808dd5bf3";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_URL = "https://gql.twitch.tv/gql";
const MAX_LIMIT = 100;
const PER_PAGE = 15;

// type param -> GraphQL target index. All 3 enumerated values, with Chinese labels:
//   channel = 主播频道/直播 (streamer accounts & live streams) -> CHANNEL
//   category = 游戏/分类 (games/topics) -> GAME
//   video = 视频 (VODs and uploads) -> VOD
const TARGET_MAP = {
  channel: "CHANNEL",
  category: "GAME",
  video: "VOD",
};

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (parseInt(c) ^ (Math.random() * 16 >> parseInt(c) / 4)).toString(16)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random 200-700ms pause between paginated requests (polite pacing).
async function randomSleep() {
  await sleep(200 + Math.floor(Math.random() * 501));
}

function mapChannel(item) {
  const stream = item.stream || null;
  const game = stream && stream.game ? stream.game : null;
  return {
    type: "channel",
    id: item.id || null,
    login: item.login || null,
    displayName: item.displayName || null,
    url: item.login ? `https://www.twitch.tv/${item.login}` : null,
    description: item.description || null,
    profileImageURL: item.profileImageURL || null,
    followers: item.followers && typeof item.followers.totalCount === "number"
      ? item.followers.totalCount
      : null,
    isLive: !!stream,
    streamTitle: stream && item.broadcastSettings ? item.broadcastSettings.title || null : null,
    gameName: game ? game.displayName || game.name || null : null,
    viewersCount: stream && typeof stream.viewersCount === "number" ? stream.viewersCount : null,
    tags: stream && Array.isArray(stream.freeformTags)
      ? stream.freeformTags.map((t) => t.name || null).filter(Boolean)
      : [],
    isPartner: item.roles ? !!item.roles.isPartner : null,
  };
}

function mapCategory(item) {
  return {
    type: "category",
    id: item.id || null,
    name: item.displayName || item.name || null,
    slug: item.slug || null,
    url: item.slug ? `https://www.twitch.tv/directory/category/${item.slug}` : null,
    avatarURL: item.boxArtURL || item.avatarURL || null,
    viewersCount: typeof item.viewersCount === "number" ? item.viewersCount : null,
    tags: Array.isArray(item.tags)
      ? item.tags.map((t) => t.localizedName || t.name || t.tagName || null).filter(Boolean)
      : [],
  };
}

function mapVideo(item) {
  return {
    type: "video",
    id: item.id || null,
    title: item.title || null,
    // The GraphQL item has no `url` field — the card URL is constructed from the id.
    url: item.id ? `https://www.twitch.tv/videos/${item.id}` : null,
    thumbnailURL: item.previewThumbnailURL || null,
    duration: typeof item.lengthSeconds === "number" ? item.lengthSeconds : null,
    viewCount: typeof item.viewCount === "number" ? item.viewCount : null,
    // The item has no `publishedAt` field — the publish date is `createdAt` (ISO 8601).
    publishedAt: item.createdAt || null,
    author: item.owner ? item.owner.displayName || item.owner.login || null : null,
  };
}

async function fetchSearchPage(query, targetIndex, cursor) {
  const targets = cursor ? [{ index: targetIndex, cursor }] : [{ index: targetIndex }];
  const payload = [
    {
      operationName: "SearchResultsPage_SearchResults",
      variables: {
        platform: "web",
        query,
        options: { targets, shouldSkipDiscoveryControl: false },
        requestID: uuidv4(),
      },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: SHA256_HASH },
      },
    },
  ];

  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Id": CLIENT_ID },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      lastError = `network error: ${error.message}`;
      if (attempt < maxAttempts) { await randomSleep(); continue; }
      throw makeError("NETWORK_ERROR", `Twitch GraphQL request failed: ${error.message}`);
    }

    if (res.status !== 200) {
      lastError = `HTTP ${res.status}`;
      if (attempt < maxAttempts) { await randomSleep(); continue; }
      throw makeError("DRIFT_DETECTED", `Twitch GraphQL returned HTTP ${res.status}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(await res.text());
    } catch (error) {
      lastError = `invalid JSON: ${error.message}`;
      if (attempt < maxAttempts) { await randomSleep(); continue; }
      throw makeError("DRIFT_DETECTED", `Failed to parse GraphQL response: ${error.message}`);
    }

    const entry = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
    if (!entry || !entry.data || !entry.data.searchFor) {
      lastError = "unexpected GraphQL response structure";
      if (attempt < maxAttempts) { await randomSleep(); continue; }
      throw makeError("DRIFT_DETECTED", "Unexpected GraphQL response structure");
    }

    const errors = entry.errors;
    const isRetryableServiceError = errors && errors.length > 0 && /service error/i.test(errors[0].message);
    if (isRetryableServiceError) {
      lastError = errors[0].message;
      if (attempt < maxAttempts) { await randomSleep(); continue; }
      // Retries exhausted but usable data may still be present — hand it back.
      return entry;
    }
    if (errors && errors.length > 0) {
      throw makeError("DRIFT_DETECTED", errors[0].message);
    }
    return entry;
  }
  throw makeError("DRIFT_DETECTED", lastError || `GraphQL request failed after ${maxAttempts} attempts`);
}

export default async function (params) {
  const rawQuery = params.query;
  if (rawQuery === undefined || rawQuery.trim() === "") {
    throw makeError("MISSING_PARAM", "query is required and must not be empty");
  }
  const query = rawQuery.trim();

  const type = (params.type ?? "channel").trim().toLowerCase();
  const targetIndex = TARGET_MAP[type];
  if (!targetIndex) {
    throw makeError("INVALID_PARAM", `type must be one of: ${Object.keys(TARGET_MAP).join(", ")}`);
  }

  const rawLimit = params.limit ?? "20";
  if (!/^\d+$/.test(rawLimit)) {
    throw makeError("INVALID_PARAM", `limit must be a positive integer, got "${rawLimit}"`);
  }
  const limit = parseInt(rawLimit, 10);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw makeError("INVALID_PARAM", `limit must be a positive integer, got "${rawLimit}"`);
  }
  if (limit > MAX_LIMIT) {
    throw makeError("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }

  const results = [];
  let cursor = null;

  while (results.length < limit) {
    const entry = await fetchSearchPage(query, targetIndex, cursor);
    const searchFor = entry.data.searchFor;
    const section = type === "channel"
      ? searchFor.channels
      : type === "category"
        ? searchFor.games
        : searchFor.videos;
    const edges = section && Array.isArray(section.edges) ? section.edges : [];
    if (edges.length === 0) break; // no more results

    for (const edge of edges) {
      const item = edge && edge.item;
      if (!item) continue;
      const mapped = type === "channel"
        ? mapChannel(item)
        : type === "category"
          ? mapCategory(item)
          : mapVideo(item);
      results.push(mapped);
      if (results.length >= limit) break;
    }

    cursor = section && section.cursor ? section.cursor : null;
    if (!cursor) break; // exhausted

    if (results.length < limit) {
      await randomSleep();
    }
  }

  // partial=true only when some results were returned but fewer than the requested limit.
  // An empty result (0 items) is a complete "no match", so partial stays false there.
  const partial = results.length > 0 && results.length < limit;

  return {
    query,
    type,
    limit,
    maxLimit: MAX_LIMIT,
    results,
    count: results.length,
    partial: partial || undefined,
  };
}
