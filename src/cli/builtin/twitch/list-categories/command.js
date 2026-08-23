// twitch/list-categories — Twitch top categories ranked by live viewer count.
// Source: Twitch internal GraphQL (https://gql.twitch.tv/gql), public web Client-ID.
// No login, no browser. Single first-page request covers limit 1-100.
// Pagination via `after` cursor triggers Twitch's IntegrityCheckFailed, so it is not used.

const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const GQL_URL = "https://gql.twitch.tv/gql";
const MAX_LIMIT = 100;
const BOX_ART_SIZE = "285x380";

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

// Random sleep 200-700ms between requests (polite pacing).
function sleep() {
  const ms = 200 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function (params) {
  // ---- Validate limit (regex on the raw string first, then numeric checks) ----
  const rawLimit = params.limit === undefined || params.limit === null || params.limit === ""
    ? "20"
    : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  let limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit)) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  if (limit < 1) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  if (limit > MAX_LIMIT) {
    throw makeError("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }

  // ---- Build the GraphQL query (limit is a validated integer, safe to inline) ----
  const query = `query { games(first: ${limit}) { edges { cursor node { id name displayName slug viewersCount boxArtURL tags(tagType: CONTENT) { localizedName } } } pageInfo { hasNextPage endCursor } } }`;
  const payload = JSON.stringify([{ query }]);

  // ---- Execute with retries on transient service errors ----
  let gqlResult = null;
  let lastError = null;
  const maxRetries = 4;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      await sleep();
    }
    try {
      const res = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Id": CLIENT_ID },
        body: payload,
      });
      gqlResult = { status: res.status, text: await res.text() };
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
  }

  if (!gqlResult || gqlResult.status !== 200) {
    throw makeError("DRIFT_DETECTED", lastError || `GraphQL request failed after ${maxRetries} attempts`);
  }

  let data;
  try {
    data = JSON.parse(gqlResult.text);
  } catch (e) {
    throw makeError("DRIFT_DETECTED", lastError || `Failed to parse GraphQL response: ${e.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw makeError("DRIFT_DETECTED", lastError || "Unexpected GraphQL response structure");
  }

  const gamesEntry = data.find((entry) => entry.data && entry.data.games);
  const errors = data[0].errors;
  if (errors && errors.length > 0) {
    throw makeError("DRIFT_DETECTED", errors[0].message);
  }
  if (!gamesEntry) {
    throw makeError("DRIFT_DETECTED", lastError || "games data missing in GraphQL response");
  }

  const games = gamesEntry.data.games;
  const edges = games && games.edges ? games.edges : [];

  // ---- Map to the output contract ----
  const results = [];
  for (const edge of edges) {
    const node = edge && edge.node;
    if (!node) continue;
    const slug = node.slug || null;
    results.push({
      id: node.id || null,
      name: node.displayName || node.name || null,
      slug,
      tags: Array.isArray(node.tags)
        ? node.tags.map((t) => t.localizedName || null).filter(Boolean)
        : [],
      liveViewers: typeof node.viewersCount === "number" ? node.viewersCount : null,
      boxArtUrl: node.boxArtURL ? node.boxArtURL.replace("{width}x{height}", BOX_ART_SIZE) : null,
      url: slug ? `https://www.twitch.tv/directory/category/${slug}` : null,
    });
  }

  return {
    results,
    count: results.length,
    limit,
    maxLimit: MAX_LIMIT,
    partial: results.length < limit,
  };
}
