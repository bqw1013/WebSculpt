const API_ROOT = "https://hacker-news.firebaseio.com/v0";
const MAX_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 12000;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

async function fetchJson(url) {
  let lastNetworkError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429) fail("RATE_LIMITED", "Hacker News API returned HTTP 429");
      if (!response.ok) fail("API_ERROR", `Hacker News API returned HTTP ${response.status}`);
      try {
        return await response.json();
      } catch {
        fail("DRIFT_DETECTED", "Hacker News API returned invalid JSON");
      }
    } catch (error) {
      if (error && error.code) throw error;
      lastNetworkError = error;
      if (attempt === 1) break;
    } finally {
      clearTimeout(timer);
    }
  }
  const detail = lastNetworkError && lastNetworkError.name === "AbortError" ? "request timed out" : "request failed";
  fail("NETWORK_ERROR", `Hacker News API ${detail} after one retry`);
}

async function mapWithConcurrency(values, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await worker(values[index], index);
    }
  }
  const workers = [];
  const count = Math.min(MAX_CONCURRENCY, values.length);
  for (let i = 0; i < count; i += 1) workers.push(run());
  await Promise.all(workers);
  return output;
}

function titleKind(title) {
  if (title.startsWith("Ask HN:")) return "ask";
  if (title.startsWith("Tell HN:")) return "tell";
  return "other";
}

export default async function(params) {
  const rawLimit = params.limit;
  if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
    fail("INVALID_PARAM", "limit must be an integer between 1 and 50");
  }
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    fail("INVALID_PARAM", "limit must be an integer between 1 and 50");
  }

  const ids = await fetchJson(`${API_ROOT}/askstories.json`);
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id))) {
    fail("DRIFT_DETECTED", "askstories response is not an array of numeric IDs");
  }
  const selectedIds = ids.slice(0, limit);
  if (selectedIds.length === 0) fail("EMPTY_RESULT", "Hacker News Ask feed is empty");

  const records = await mapWithConcurrency(selectedIds, async (id) => {
    const item = await fetchJson(`${API_ROOT}/item/${id}.json`);
    if (!item || item.deleted || item.dead || item.type !== "story") return null;
    if (!Number.isSafeInteger(item.id) || typeof item.title !== "string" || !item.title ||
        typeof item.by !== "string" || !Number.isFinite(item.time)) return null;
    const url = typeof item.url === "string" && item.url.length > 0 ? item.url : null;
    const points = Number.isFinite(item.score) ? item.score : 0;
    const numComments = Number.isFinite(item.descendants) ? item.descendants : 0;
    return { item, url, points, numComments };
  });

  const items = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const { item, url, points, numComments } = record;
    items.push({
      rank: index + 1,
      storyId: item.id,
      title: item.title,
      url,
      hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
      author: item.by,
      createdAt: new Date(item.time * 1000).toISOString(),
      points,
      numComments,
      isTextPost: url === null,
      text: typeof item.text === "string" ? item.text : null,
      titleKind: titleKind(item.title)
    });
  }
  if (items.length === 0) fail("EMPTY_RESULT", "No eligible Ask story was available");
  return items;
}
