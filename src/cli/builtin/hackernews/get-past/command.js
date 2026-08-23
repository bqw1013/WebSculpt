const PAGE_ROOT = "https://news.ycombinator.com";
const API_ROOT = "https://hacker-news.firebaseio.com/v0";
const PAGE_SIZE = 30;
const MAX_CONCURRENCY = 6;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 10_000;

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  error.isCommandError = true;
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
      if (error && error.isCommandError) {
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

function validateDate(rawDate) {
  if (rawDate === undefined || rawDate === "") {
    return null;
  }
  if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw commandError("INVALID_PARAM", "date must be a real YYYY-MM-DD date and cannot be in the future.");
  }
  const [year, month, day] = rawDate.split("-").map((value) => Number.parseInt(value, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw commandError("INVALID_PARAM", "date must be a real YYYY-MM-DD date and cannot be in the future.");
  }
  if (rawDate > new Date().toISOString().slice(0, 10)) {
    throw commandError("INVALID_PARAM", "date must be a real YYYY-MM-DD date and cannot be in the future.");
  }
  return rawDate;
}

function validateLimit(rawLimit) {
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
    throw commandError("INVALID_PARAM", "limit must be an integer from 1 to 50.");
  }
  const limit = Number.parseInt(rawLimit, 10);
  if (limit < 1 || limit > 50) {
    throw commandError("INVALID_PARAM", "limit must be an integer from 1 to 50.");
  }
  return limit;
}

async function readPage(page, url, requestedDate) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const result = await page.evaluate(() => ({
      title: document.title,
      ids: Array.from(document.querySelectorAll("tr.athing"))
        .map((row) => Number.parseInt(row.id, 10))
        .filter((id) => Number.isInteger(id)),
    }));
    if (!result || typeof result.title !== "string") {
      throw commandError("DRIFT_DETECTED", "Hacker News past page title is missing.");
    }
    if (result.title.trim() === "" && result.ids.length === 0) {
      return { snapshotDate: requestedDate, ids: [] };
    }
    const titleMatch = result.title.match(/^(\d{4}-\d{2}-\d{2}) front\s*\|\s*Hacker News$/i);
    if (!titleMatch) {
      throw commandError("DRIFT_DETECTED", "Hacker News past page title changed.");
    }
    const snapshotDate = titleMatch[1];
    if (requestedDate && snapshotDate !== requestedDate) {
      throw commandError("DRIFT_DETECTED", "Hacker News returned a different past snapshot date.");
    }
    return { snapshotDate, ids: result.ids };
  } catch (error) {
    if (error && error.isCommandError) {
      throw error;
    }
    throw commandError("NETWORK_ERROR", "Unable to load the Hacker News past page.");
  }
}

function toStory(item, rank) {
  if (!item || item.deleted || item.dead || item.type !== "story") {
    return null;
  }
  if (!Number.isInteger(item.id) || typeof item.title !== "string" ||
      typeof item.by !== "string" || !Number.isFinite(item.time)) {
    throw commandError("DRIFT_DETECTED", "A Hacker News story is missing required fields.");
  }
  const url = typeof item.url === "string" && item.url.length > 0 ? item.url : null;
  return {
    rank,
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

async function fetchBatch(ids, startRank) {
  const stories = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < ids.length) {
      const index = nextIndex;
      nextIndex += 1;
      const id = ids[index];
      const item = await fetchJson(`${API_ROOT}/item/${id}.json`);
      const story = toStory(item, startRank + index);
      if (story) {
        stories.push(story);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, worker));
  return stories;
}

export default async function(page, params, cwd) {
  const requestedDate = validateDate(params.date);
  const limit = validateLimit(params.limit);
  const baseUrl = requestedDate ? `${PAGE_ROOT}/front?day=${requestedDate}` : `${PAGE_ROOT}/front`;
  const items = [];
  let snapshotDate = null;
  let pageNumber = 1;

  while (items.length < limit && pageNumber <= MAX_PAGES) {
    const pageUrl = pageNumber === 1
      ? baseUrl
      : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}p=${pageNumber}`;
    const result = await readPage(page, pageUrl, requestedDate);
    snapshotDate = snapshotDate || result.snapshotDate;
    if (result.ids.length === 0) {
      break;
    }

    let offset = 0;
    while (offset < result.ids.length && items.length < limit) {
      const batch = result.ids.slice(offset, offset + MAX_CONCURRENCY);
      items.push(...await fetchBatch(batch, (pageNumber - 1) * PAGE_SIZE + offset + 1));
      offset += batch.length;
    }
    if (offset < result.ids.length || result.ids.length < PAGE_SIZE) {
      break;
    }
    pageNumber += 1;
  }

  if (items.length === 0) {
    throw commandError("EMPTY_RESULT", "No eligible Hacker News stories were available for this past snapshot.");
  }
  items.sort((left, right) => left.rank - right.rank);
  return { snapshotDate, items: items.slice(0, limit) };
}
