// twitch/get-video: fetch a single Twitch VOD's full detail from /videos/{id}.
//
// Data source (verified in explore): Twitch internal GraphQL https://gql.twitch.tv/gql.
//   - VideoMetadata                      -> title, channel(owner), category(game), duration, views,
//                                           publishedAt, description, previewThumbnailURL
//   - VideoPlayer_ChapterSelectButtonVideo -> video.moments.edges[] (chapters, when present)
// A fresh page.goto to /videos/{id} reliably triggers both; a same-page reload may be served
// from HTTP cache and skip them, so the command always navigates.

const GQL_URL = "https://gql.twitch.tv/gql";

function businessError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

// Extract a numeric video id from a full URL (https://www.twitch.tv/videos/{id}) or a bare numeric id.
function parseVideoId(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/\/videos\/(\d+)/);
  if (m) return m[1];
  return null;
}

function normalizeThumbnail(url) {
  if (!url) return url;
  if (url.includes("{width}x{height}")) {
    return url.replace("{width}x{height}", "320x180");
  }
  // e.g. ".../thumb/thumb0-90x60.jpg" -> 320x180
  return url.replace(/(\d+)x(\d+)(\.(?:jpg|png|jpeg|webp))$/i, "320x180$3");
}

export default async (page, params, cwd) => {
  const raw = params.url;
  const videoId = parseVideoId(raw);
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw businessError("MISSING_PARAM", "Missing required parameter: url");
  }
  if (!videoId) {
    throw businessError("INVALID_PARAM", "url must be a Twitch video URL (https://www.twitch.tv/videos/{id}) or a numeric video id");
  }

  const target = `https://www.twitch.tv/videos/${videoId}`;

  // Polite pacing: random 200-800ms before navigation.
  await page.waitForTimeout(200 + Math.floor(Math.random() * 600));

  const captured = { meta: null, chapters: null };

  const onResponse = async (res) => {
    try {
      const url = res.url();
      if (!url.includes(GQL_URL)) return;
      const json = await res.json();
      const list = Array.isArray(json) ? json : [json];
      for (const op of list) {
        const name = op && op.extensions && op.extensions.operationName;
        if (!name || !op.data) continue;
        if (name === "VideoMetadata" && op.data.video && String(op.data.video.id) === videoId) {
          captured.meta = op.data;
        }
        if (name === "VideoPlayer_ChapterSelectButtonVideo" && op.data.video && String(op.data.video.id) === videoId) {
          captured.chapters = op.data.video.moments;
        }
      }
    } catch (e) {
      // Response body not parseable or already consumed; ignore for this request.
    }
  };

  page.on("response", onResponse);

  await page.goto(target, { waitUntil: "domcontentloaded" }).catch(() => {});

  // Wait for VideoMetadata (or a core-error page) with a deadline.
  const metaDeadline = Date.now() + 25000;
  let hasError = false;
  while (Date.now() < metaDeadline) {
    if (captured.meta) break;
    hasError = await page
      .evaluate(() => !!document.querySelector(".core-error"))
      .catch(() => false);
    if (hasError) break;
    await page.waitForTimeout(400);
  }

  // Once meta is present, give the chapter operation a short grace window.
  if (captured.meta && captured.meta.video && captured.chapters === null) {
    const chapDeadline = Date.now() + 5000;
    while (Date.now() < chapDeadline && captured.chapters === null) {
      await page.waitForTimeout(300);
    }
  }

  page.removeListener("response", onResponse);

  if (!captured.meta) {
    const err = hasError
      ? businessError("NOT_FOUND", "Video does not exist or is unavailable")
      : businessError("TIMEOUT", "Video details did not load in time");
    throw err;
  }

  if (!captured.meta.video) {
    throw businessError("NOT_FOUND", "Video does not exist or is unavailable");
  }

  const v = captured.meta.video;
  const channelLogin = v.owner && v.owner.login;
  const game = v.game;

  const chapters = [];
  if (captured.chapters && Array.isArray(captured.chapters.edges)) {
    for (const edge of captured.chapters.edges) {
      const node = edge && edge.node;
      if (!node) continue;
      chapters.push({
        title: node.description || null,
        startAt: Math.floor((node.positionMilliseconds || 0) / 1000),
      });
    }
  }

  return {
    title: v.title,
    url: `https://www.twitch.tv/videos/${v.id}`,
    channel: {
      name: channelLogin,
      displayName: v.owner ? v.owner.displayName : null,
      url: channelLogin ? `https://www.twitch.tv/${channelLogin}` : null,
    },
    category: game
      ? {
          name: game.displayName || game.name || null,
          slug: game.slug || null,
          url: game.slug ? `https://www.twitch.tv/directory/category/${game.slug}` : null,
        }
      : null,
    duration: v.lengthSeconds,
    views: v.viewCount,
    publishedAt: v.publishedAt,
    description: v.description,
    chapters,
    thumbnailUrl: normalizeThumbnail(v.previewThumbnailURL),
  };
};
