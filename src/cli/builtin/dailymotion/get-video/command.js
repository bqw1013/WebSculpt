// dailymotion/get-video
// Fetch a single Dailymotion video's metadata (and optionally comments/subtitles) via the public API.
// Polite pacing: random 200-700ms sleep before each HTTP request.

const VIDEO_FIELDS = [
  "id", "title", "description", "duration", "created_time", "views_total",
  "likes_total", "tags", "language", "channel", "thumbnail_url",
  "owner.id", "owner.username", "owner.screenname", "owner.url"
].join(",");

const COMMENT_FIELDS = [
  "id", "message", "created_time",
  "owner.username", "owner.screenname", "owner.id"
].join(",");

function sleepRandom() {
  const ms = 200 + Math.floor(Math.random() * 501); // 200-700ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    await sleepRandom();
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) {
      const err = new Error("[NOT_FOUND] Dailymotion video not found");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (res.status === 400) {
      const err = new Error("[DRIFT_DETECTED] Dailymotion API rejected the request fields");
      err.code = "DRIFT_DETECTED";
      throw err;
    }
    if (!res.ok) {
      const err = new Error("[HTTP_ERROR] Dailymotion API returned HTTP " + res.status);
      err.code = "HTTP_ERROR";
      throw err;
    }
    return await res.json();
  } catch (e) {
    if (e && e.code) throw e;
    if (e && e.name === "AbortError") {
      const err = new Error("[HTTP_ERROR] Dailymotion API request timed out");
      err.code = "HTTP_ERROR";
      throw err;
    }
    const err = new Error("[NETWORK_ERROR] Failed to reach Dailymotion API: " + (e && e.message ? e.message : String(e)));
    err.code = "NETWORK_ERROR";
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Extract a Dailymotion video ID from a URL or a bare ID string.
function extractVideoId(input) {
  const s = String(input).trim();
  if (!s) return null;
  let m = s.match(/\/video\/([a-z0-9]+)/i);
  if (m) return m[1];
  m = s.match(/[?&]video=([a-z0-9]+)/i);
  if (m) return m[1];
  if (/^[a-z][a-z0-9]{3,}$/i.test(s)) return s; // bare ID e.g. xaxueoe
  m = s.match(/([a-z0-9]{4,})\/?(\?.*)?$/i);
  if (m && /dailymotion\.com/i.test(s)) return m[1];
  return null;
}

// Strip <br /> and other HTML from API description text.
function stripHtml(value) {
  return String(value || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIso(epochSeconds) {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null;
}

function invalidParam(message) {
  const err = new Error("[INVALID_PARAM] " + message);
  err.code = "INVALID_PARAM";
  return err;
}

export default async function(params) {
  const rawUrl = String(params.url || "").trim();
  if (!rawUrl) {
    const err = new Error("[MISSING_PARAM] url is required (video URL or ID)");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const id = extractVideoId(rawUrl);
  if (!id) {
    throw invalidParam("Cannot extract a Dailymotion video ID from: " + rawUrl);
  }

  const includeComments = params.include_comments === "true";
  const includeSubtitles = params.include_subtitles === "true";

  // comment_limit: manifest default is "20"; validate the raw string (no parseInt truncation).
  const rawLimit = String(params.comment_limit || "").trim();
  if (!/^\d+$/.test(rawLimit)) {
    throw invalidParam("comment_limit must be an integer between 1 and 100");
  }
  const commentLimit = parseInt(rawLimit, 10);
  if (commentLimit < 1 || commentLimit > 100) {
    throw invalidParam("comment_limit must be between 1 and 100");
  }

  const videoUrl =
    "https://api.dailymotion.com/video/" + encodeURIComponent(id) +
    "?fields=" + encodeURIComponent(VIDEO_FIELDS);

  const video = await fetchJson(videoUrl);

  const result = {
    id: video.id,
    title: video.title,
    url: "https://www.dailymotion.com/video/" + video.id,
    description: stripHtml(video.description),
    duration: video.duration,
    createdAt: toIso(video.created_time),
    views: video.views_total,
    likes: video.likes_total,
    tags: Array.isArray(video.tags) ? video.tags : [],
    channel: video.channel,
    language: video.language,
    thumbnail: video.thumbnail_url,
    owner: {
      id: video["owner.id"] || null,
      username: video["owner.username"] || null,
      screenname: video["owner.screenname"] || null,
      url: video["owner.url"] || null
    }
  };

  if (includeComments) {
    const commentsUrl =
      "https://api.dailymotion.com/video/" + encodeURIComponent(id) +
      "/comments?fields=" + encodeURIComponent(COMMENT_FIELDS) +
      "&limit=" + commentLimit;
    const commentsData = await fetchJson(commentsUrl);
    result.comments = (commentsData.list || []).map((comment) => ({
      author: comment["owner.screenname"] || comment["owner.username"] || null,
      text: comment.message || "",
      createdAt: toIso(comment.created_time)
    }));
    if (typeof commentsData.total === "number" && commentsData.total > commentLimit) {
      result.partial = true;
    }
  }

  if (includeSubtitles) {
    const subtitlesUrl =
      "https://api.dailymotion.com/video/" + encodeURIComponent(id) +
      "/subtitles?fields=language,url&limit=100";
    const subtitlesData = await fetchJson(subtitlesUrl);
    result.subtitles = (subtitlesData.list || []).map((sub) => ({
      language: sub.language || null,
      url: sub.url || null
    }));
  }

  return result;
}
