const API_ROOT = "https://hacker-news.firebaseio.com/v0";
const MAX_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 10_000;

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 429) {
        throw commandError("RATE_LIMITED", "Hacker News API returned HTTP 429.");
      }
      if (!response.ok) {
        throw commandError("API_ERROR", `Hacker News API returned HTTP ${response.status}.`);
      }

      try {
        return await response.json();
      } catch {
        throw commandError("DRIFT_DETECTED", "Hacker News API returned invalid JSON.");
      }
    } catch (error) {
      if (error && error.code) {
        throw error;
      }
      if (attempt === 1) {
        throw commandError("NETWORK_ERROR", "Unable to reach the Hacker News API after one retry.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw commandError("NETWORK_ERROR", "Unable to reach the Hacker News API.");
}

function toStory(item, sourceRank) {
  if (!item || item.deleted || item.dead || item.type !== "story") {
    return null;
  }
  if (!Number.isInteger(item.id) || typeof item.title !== "string" ||
      typeof item.by !== "string" || !Number.isFinite(item.time)) {
    throw commandError("DRIFT_DETECTED", "A Hacker News story is missing required fields.");
  }

  const url = typeof item.url === "string" && item.url.length > 0 ? item.url : null;
  return {
    sourceRank,
    storyId: item.id,
    title: item.title,
    url,
    hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
    author: item.by,
    createdAt: new Date(item.time * 1000).toISOString(),
    points: Number.isFinite(item.score) ? item.score : 0,
    numComments: Number.isFinite(item.descendants) ? item.descendants : 0,
    isTextPost: url === null,
  };
}

export default async function(params) {
  const rawLimit = params.limit;
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
    throw commandError("INVALID_PARAM", "limit must be an integer from 1 to 50.");
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (limit < 1 || limit > 50) {
    throw commandError("INVALID_PARAM", "limit must be an integer from 1 to 50.");
  }

  const ids = await fetchJson(`${API_ROOT}/newstories.json`);
  if (!Array.isArray(ids)) {
    throw commandError("DRIFT_DETECTED", "newstories did not return an ID array.");
  }

  const stories = [];
  let nextIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENCY, ids.length, limit);

  async function worker() {
    while (stories.length < limit && nextIndex < ids.length) {
      const sourceRank = nextIndex + 1;
      const id = ids[nextIndex];
      nextIndex += 1;

      if (!Number.isInteger(id)) {
        throw commandError("DRIFT_DETECTED", "newstories contains a non-integer item ID.");
      }

      const item = await fetchJson(`${API_ROOT}/item/${id}.json`);
      const story = toStory(item, sourceRank);
      if (story) {
        stories.push(story);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  const orderedStories = stories
    .sort((left, right) => left.sourceRank - right.sourceRank)
    .slice(0, limit)
    .map((story, index) => ({
      rank: index + 1,
      storyId: story.storyId,
      title: story.title,
      url: story.url,
      hnUrl: story.hnUrl,
      author: story.author,
      createdAt: story.createdAt,
      points: story.points,
      numComments: story.numComments,
      isTextPost: story.isTextPost,
    }));

  if (orderedStories.length === 0) {
    throw commandError("EMPTY_RESULT", "No eligible Hacker News stories were available.");
  }

  return orderedStories;
}
