// twitch/get-channel-clips — browser runtime
// Clips list for a Twitch channel via the internal GraphQL operation ClipsCards__User.
// Single request (limit 1-100); no cursor pagination (cursor requests are integrity-gated upstream).

const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const CLIPS_SHA256_HASH = "1cd671bfa12cec480499c087319f26d21925e9695d1f80225aae6a4354f23088";
const MAX_LIMIT = 100;

// 用户侧 range 枚举 -> GraphQL criteria.filter（中文对照）
// 24h -> LAST_DAY   (站点下拉"热门 24 小时", URL ?range=24hr)
// 7d  -> LAST_WEEK  (站点下拉"热门 7 天",   URL ?range=7d, 默认)
// 30d -> LAST_MONTH (站点下拉"热门 30 天",  URL ?range=30d)
// all -> ALL_TIME   (站点下拉"热门 所有",   URL ?range=all)
const RANGE_TO_FILTER = {
  "24h": "LAST_DAY",
  "7d": "LAST_WEEK",
  "30d": "LAST_MONTH",
  "all": "ALL_TIME",
};

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async (page, params, cwd) => {
  const channel = (params.channel || "").trim();
  if (!channel) {
    throw makeError("MISSING_PARAM", "channel is required");
  }

  const range = params.range === undefined || params.range === null || params.range === ""
    ? "7d"
    : String(params.range).trim().toLowerCase();
  const filter = RANGE_TO_FILTER[range];
  if (!filter) {
    throw makeError("INVALID_RANGE", `range must be one of: ${Object.keys(RANGE_TO_FILTER).join(", ")}`);
  }

  const rawLimit = params.limit === undefined || params.limit === null || params.limit === ""
    ? "20"
    : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw makeError("INVALID_LIMIT", `limit must be between 1 and ${MAX_LIMIT}`);
  }

  const payload = [
    {
      operationName: "ClipsCards__User",
      variables: {
        login: channel,
        limit,
        criteria: {
          filter,
          shouldFilterByDiscoverySetting: true,
        },
        cursor: null,
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: CLIPS_SHA256_HASH,
        },
      },
    },
  ];

  let gqlResult = null;
  let lastError = null;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Polite pacing: random wait before each request + a small random mouse move
    try {
      await page.mouse.move(rand(60, 300), rand(60, 300));
    } catch (e) {
      // ignore mouse move failures (page may have no viewport yet)
    }
    await page.waitForTimeout(rand(300, 700));

    try {
      gqlResult = await page.evaluate(async ({ payloadJson, clientId }) => {
        const res = await fetch("https://gql.twitch.tv/gql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Id": clientId,
          },
          body: payloadJson,
        });
        const text = await res.text();
        return { status: res.status, text };
      }, { payloadJson: JSON.stringify(payload), clientId: CLIENT_ID });
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
        const isRetryableServiceError = responseErrors && responseErrors.length > 0 &&
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
      await page.waitForTimeout(rand(500, 900));
    }
  }

  if (!gqlResult || gqlResult.status !== 200) {
    throw makeError("DRIFT_DETECTED", lastError || `GraphQL request failed after ${maxRetries} attempts`);
  }

  let data;
  try {
    data = JSON.parse(gqlResult.text);
  } catch (e) {
    throw makeError("DRIFT_DETECTED", `Failed to parse GraphQL response: ${e.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw makeError("DRIFT_DETECTED", "Unexpected GraphQL response structure");
  }

  const entry = data[0];
  const errors = entry.errors;
  if (errors && errors.length > 0) {
    throw makeError("DRIFT_DETECTED", `GraphQL error: ${errors[0].message}`);
  }

  const user = entry.data && entry.data.user;
  if (!user) {
    throw makeError("CHANNEL_NOT_FOUND", `Channel "${channel}" was not found on Twitch`);
  }
  if (!user.clips || !Array.isArray(user.clips.edges)) {
    throw makeError("DRIFT_DETECTED", "clips data missing in GraphQL response");
  }

  const items = user.clips.edges
    .map((edge) => {
      const node = edge && edge.node;
      if (!node) return null;
      return {
        title: node.title || null,
        url: node.url || null,
        views: typeof node.viewCount === "number" ? node.viewCount : null,
        clipper: node.curator ? (node.curator.displayName || node.curator.login || null) : null,
        duration: typeof node.durationSeconds === "number" ? node.durationSeconds : null,
        createdAt: node.createdAt || null,
        thumbnailUrl: node.thumbnailURL || null,
      };
    })
    .filter(Boolean);

  return {
    items,
    count: items.length,
    limit,
    range,
    partial: items.length < limit,
  };
};
