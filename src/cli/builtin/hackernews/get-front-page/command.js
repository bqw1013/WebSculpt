import https from "https";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 429) {
        const err = new Error("[RATE_LIMITED] HackerNews API rate limit exceeded. Please try again later.");
        err.code = "RATE_LIMITED";
        reject(err);
        return;
      }
      if (res.statusCode >= 400) {
        const err = new Error(`[API_ERROR] HackerNews API returned status ${res.statusCode}`);
        err.code = "API_ERROR";
        reject(err);
        return;
      }

      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          const err = new Error("[PARSE_ERROR] Failed to parse API response as JSON");
          err.code = "PARSE_ERROR";
          reject(err);
        }
      });
    });

    req.on("error", (e) => {
      const err = new Error(`[NETWORK_ERROR] Request failed: ${e.message}`);
      err.code = "NETWORK_ERROR";
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      const err = new Error("[NETWORK_ERROR] Request timed out");
      err.code = "NETWORK_ERROR";
      reject(err);
    });
  });
}

export default async function(params) {
  const rawLimit = params.limit;
  const rawSortBy = params.sortBy;

  let limit = 15;
  if (rawLimit !== undefined && rawLimit !== "") {
    limit = parseInt(rawLimit, 10);
    if (Number.isNaN(limit) || limit < 1) {
      const err = new Error("[INVALID_PARAM] limit must be a positive integer");
      err.code = "INVALID_PARAM";
      throw err;
    }
    if (limit > 30) {
      limit = 30;
    }
  }

  const allowedSorts = ["points", "comments"];
  if (rawSortBy !== undefined && rawSortBy !== "" && !allowedSorts.includes(rawSortBy)) {
    const err = new Error(`[INVALID_PARAM] sortBy must be "points" or "comments", got "${rawSortBy}"`);
    err.code = "INVALID_PARAM";
    throw err;
  }
  const sortBy = allowedSorts.includes(rawSortBy) ? rawSortBy : "points";

  const url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit}`;

  // Random delay before the main network request
  await new Promise(r => setTimeout(r, Math.random() * 1000));

  const data = await fetchJson(url);

  if (!data || !Array.isArray(data.hits)) {
    const err = new Error("[DRIFT_DETECTED] API response structure changed: missing hits array");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  if (data.hits.length === 0) {
    return [];
  }

  let stories = data.hits.map((hit, index) => ({
    rank: index + 1,
    title: hit.title || "",
    url: hit.url || null,
    hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID || hit.story_id}`,
    points: typeof hit.points === "number" ? hit.points : 0,
    numComments: typeof hit.num_comments === "number" ? hit.num_comments : 0,
    author: hit.author || "",
    createdAt: hit.created_at || "",
    storyId: String(hit.objectID || hit.story_id || ""),
  }));

  if (sortBy === "comments") {
    stories.sort((a, b) => b.numComments - a.numComments);
    stories = stories.map((s, i) => ({ ...s, rank: i + 1 }));
  }

  return stories;
}
