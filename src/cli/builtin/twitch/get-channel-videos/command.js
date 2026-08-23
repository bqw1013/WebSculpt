// twitch/get-channel-videos — list a Twitch channel's videos (VOD archive).
// Data source: Twitch internal GraphQL https://gql.twitch.tv/gql, persisted operation
// FilterableVideoTower_Videos (verified in explore phase, no login / no rate limit observed).
const SHA256_HASH = "67004f7881e65c297936f32c75246470629557a393788fb5a69d6d9a25a8fd5f";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const ENDPOINT = "https://gql.twitch.tv/gql";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = "20";
const DEFAULT_TYPE = "all";

// type 枚举（页面筛选下拉实测值 + 中文对照 + GraphQL broadcastType 映射）:
//   all             → null        （所有视频 / 全部）
//   past-broadcasts → "ARCHIVE"   （过往直播 / 完整直播回放）
//   highlights      → "HIGHLIGHT" （精选内容）
//   uploads         → "UPLOAD"    （上传）
// 注：页面另有第 5 项「播放列表」(collections)，走不同查询 ChannelCollectionsContent、
//     输出为集合而非视频，v1 不覆盖（另立命令）。
const TYPE_MAP = {
  all: null,
  "past-broadcasts": "ARCHIVE",
  highlights: "HIGHLIGHT",
  uploads: "UPLOAD",
};

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function formatDuration(totalSeconds) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function (params) {
  const channel = (params.channel || "").trim();
  if (!channel) {
    throw makeError("MISSING_PARAM", "channel is required");
  }

  const rawType =
    params.type === undefined || params.type === null || params.type === ""
      ? DEFAULT_TYPE
      : String(params.type).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, rawType)) {
    throw makeError(
      "INVALID_TYPE",
      `type must be one of: ${Object.keys(TYPE_MAP).join(", ")}`
    );
  }
  const broadcastType = TYPE_MAP[rawType];

  const rawLimit =
    params.limit === undefined || params.limit === null || params.limit === ""
      ? DEFAULT_LIMIT
      : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  if (limit > MAX_LIMIT) {
    throw makeError("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }

  const payload = [
    {
      operationName: "FilterableVideoTower_Videos",
      variables: {
        includePreviewBlur: false,
        limit,
        channelOwnerLogin: channel,
        broadcastType,
        videoSort: "TIME",
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: SHA256_HASH,
        },
      },
    },
  ];

  // Polite pacing: random sleep 200-700ms between requests
  await sleep(200 + Math.floor(Math.random() * 500));

  let gqlResult = null;
  let lastError = null;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-ID": CLIENT_ID,
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      gqlResult = { status: res.status, text };
    } catch (error) {
      gqlResult = null;
      lastError = `Twitch GraphQL request failed: ${error?.message || error}`;
    }

    if (gqlResult && gqlResult.status === 200) {
      let parsed;
      try {
        parsed = JSON.parse(gqlResult.text);
      } catch (e) {
        lastError = `Failed to parse GraphQL response: ${e.message}`;
        parsed = null;
      }
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        lastError = "Unexpected GraphQL response structure";
      } else {
        const responseErrors = parsed[0].errors;
        const isRetryableServiceError =
          responseErrors &&
          responseErrors.length > 0 &&
          /service error/i.test(responseErrors[0].message);
        if (!isRetryableServiceError) {
          break;
        }
        lastError = responseErrors[0].message;
      }
    } else if (gqlResult) {
      lastError = `GraphQL returned HTTP ${gqlResult.status}`;
    }

    if (attempt < maxRetries) {
      await sleep(500 * attempt + Math.floor(Math.random() * 300));
    }
  }

  if (!gqlResult || gqlResult.status !== 200) {
    throw makeError(
      "DRIFT_DETECTED",
      lastError || `GraphQL request failed after ${maxRetries} attempts`
    );
  }

  let data;
  try {
    data = JSON.parse(gqlResult.text);
  } catch (e) {
    throw makeError("DRIFT_DETECTED", `Failed to parse GraphQL response: ${e.message}`);
  }

  if (!Array.isArray(data) || data.length === 0 || !data[0]) {
    throw makeError("DRIFT_DETECTED", "Unexpected GraphQL response structure");
  }
  const entry = data[0];
  if (entry.errors && entry.errors.length > 0) {
    throw makeError("DRIFT_DETECTED", entry.errors[0].message);
  }
  if (!entry.data || typeof entry.data !== "object") {
    throw makeError("DRIFT_DETECTED", "GraphQL data missing in response");
  }

  const user = entry.data.user;
  if (user === null || user === undefined) {
    // 频道不存在 → data.user 为 null
    return {
      channel,
      type: rawType,
      limit,
      results: [],
      count: 0,
      partial: false,
      channelFound: false,
    };
  }

  const videos = user.videos;
  if (videos === null || videos === undefined) {
    // 频道存在但无视频（或视频不可访问）→ 空结果
    return {
      channel,
      type: rawType,
      limit,
      results: [],
      count: 0,
      partial: false,
      channelFound: true,
    };
  }
  if (typeof videos !== "object") {
    throw makeError("DRIFT_DETECTED", "user.videos has unexpected shape");
  }

  const edges = Array.isArray(videos.edges) ? videos.edges : [];
  const hasNextPage = videos.pageInfo && videos.pageInfo.hasNextPage === true;

  const results = edges
    .map((edge) => {
      const node = edge && edge.node ? edge.node : null;
      if (!node) {
        return null;
      }
      const game = node.game || null;
      return {
        title: node.title || null,
        url: node.id ? `https://www.twitch.tv/videos/${node.id}` : null,
        duration: formatDuration(node.lengthSeconds),
        durationSeconds:
          typeof node.lengthSeconds === "number" ? node.lengthSeconds : null,
        views: typeof node.viewCount === "number" ? node.viewCount : null,
        publishedAt: node.publishedAt || null,
        category:
          game && (game.displayName || game.slug)
            ? { name: game.displayName || game.name || null, slug: game.slug || null }
            : null,
        thumbnailUrl: node.previewThumbnailURL || null,
      };
    })
    .filter(Boolean);

  return {
    channel,
    type: rawType,
    limit,
    results,
    count: results.length,
    partial: hasNextPage,
    channelFound: true,
  };
}
