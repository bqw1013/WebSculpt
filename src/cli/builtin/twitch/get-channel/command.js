// twitch/get-channel — channel profile + current live status.
// Data source: Twitch internal GraphQL (https://gql.twitch.tv/gql), public web Client-Id, no login.
// Three persisted queries are sent as ONE batched POST (no inter-request delay needed; retries use backoff).
const GQL_URL = "https://gql.twitch.tv/gql";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const SHELL_HASH = "fea4573a7bf2644f5b3f2cbbdcbee0d17312e48d2e55f080589d053aad353f11";
const STREAM_HASH = "ad022ca32220d5523d03a23cbcb5beaa1e0999889c1f8f78f9f2520dafb5cae6";
const ABOUT_HASH = "3b9cd4edd28e8e6f7ba6152a56157bc2b1c1a8f6e81d70808ad1b85250e5288f";
const MAX_RETRIES = 4;

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPayload(channel) {
  return [
    {
      operationName: "ChannelShell",
      variables: { login: channel },
      extensions: { persistedQuery: { version: 1, sha256Hash: SHELL_HASH } },
    },
    {
      operationName: "StreamMetadata",
      variables: { channelLogin: channel },
      extensions: { persistedQuery: { version: 1, sha256Hash: STREAM_HASH } },
    },
    {
      operationName: "ChannelRoot_AboutPanel",
      variables: { channelLogin: channel, skipSchedule: false },
      extensions: { persistedQuery: { version: 1, sha256Hash: ABOUT_HASH } },
    },
  ];
}

async function queryTwitch(payload) {
  let result = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Id": CLIENT_ID,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      result = { status: res.status, text };
    } catch (error) {
      result = null;
      lastError = `Twitch GraphQL request failed: ${error?.message || error}`;
    }

    if (result && result.status === 200) {
      let parsed;
      try {
        parsed = JSON.parse(result.text);
      } catch (e) {
        lastError = `Failed to parse GraphQL response: ${e.message}`;
        parsed = null;
      }
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        lastError = "Unexpected GraphQL response structure";
      } else {
        const errors = parsed.flatMap((entry) => entry.errors || []);
        const retryable = errors.some((err) => /service error/i.test(err.message || ""));
        if (!retryable) {
          return parsed;
        }
        lastError = errors.map((err) => err.message).join("; ");
      }
    } else if (result) {
      lastError = `GraphQL returned HTTP ${result.status}`;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(1000 * attempt);
    }
  }

  throw makeError(
    "DRIFT_DETECTED",
    lastError || `GraphQL request failed after ${MAX_RETRIES} attempts`
  );
}

// Select an operation result by shape. Twitch sometimes returns non-fatal
// field-level errors (e.g. IntegrityCheckFailed on an unrelated field) while
// the data we need is intact — so an entry's `errors` array alone is not a
// failure. Only a missing entry or a missing `data` payload is treated as drift.
function pickEntry(data, predicate) {
  const entry = data.find((item) => item.data && predicate(item.data));
  if (!entry) {
    throw makeError(
      "DRIFT_DETECTED",
      "GraphQL response missing expected operation result"
    );
  }
  return entry.data;
}

export default async function (params) {
  const channel = (params.channel || "").trim();
  if (!channel) {
    throw makeError("MISSING_PARAM", "channel is required");
  }

  const data = await queryTwitch(buildPayload(channel));

  // ChannelShell is the primary signal: it distinguishes User vs UserDoesNotExist.
  const shellData = pickEntry(data, (d) => d.userOrError !== undefined);
  const userOrError = shellData.userOrError;
  if (!userOrError || userOrError.__typename !== "User") {
    if (userOrError && userOrError.__typename === "UserDoesNotExist") {
      throw makeError("CHANNEL_NOT_FOUND", `Channel "${channel}" does not exist`);
    }
    throw makeError(
      "DRIFT_DETECTED",
      `Unexpected ChannelShell result: ${userOrError ? userOrError.__typename : "null"}`
    );
  }

  // For an existing channel all three operations are present; resolve the rest.
  const streamData = pickEntry(data, (d) => d.user && "stream" in d.user);
  const aboutData = pickEntry(data, (d) => d.user && "followers" in d.user);

  const shellUser = userOrError;
  const metaUser = streamData.user || {};
  const aboutUser = aboutData.user || {};

  const liveStream = shellUser.stream && shellUser.stream.viewersCount !== undefined
    ? shellUser.stream
    : null;

  const live = liveStream
    ? {
        title: (metaUser.lastBroadcast && metaUser.lastBroadcast.title) || null,
        category: (metaUser.stream && metaUser.stream.game && metaUser.stream.game.name) || null,
        viewers: liveStream.viewersCount,
        startedAt: (metaUser.stream && metaUser.stream.createdAt) || null,
      }
    : null;

  const followers =
    aboutUser.followers && typeof aboutUser.followers.totalCount === "number"
      ? aboutUser.followers.totalCount
      : null;

  const description =
    aboutUser.description !== undefined && aboutUser.description !== null && aboutUser.description !== ""
      ? aboutUser.description
      : null;

  const result = {
    channel: shellUser.login || channel,
    displayName: aboutUser.displayName || shellUser.displayName || null,
    followers,
    description,
    avatarUrl: aboutUser.profileImageURL || shellUser.profileImageURL || null,
    isLive: liveStream !== null,
    url: `https://www.twitch.tv/${shellUser.login || channel}`,
  };

  if (live) {
    result.live = live;
  }

  return result;
}
