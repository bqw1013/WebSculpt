import https from "https";

function getDateOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

function buildQuery(params) {
  const parts = [];

  const period = params.period || "weekly";
  let days = 7;
  if (period === "daily") days = 1;
  else if (period === "weekly") days = 7;
  else if (period === "monthly") days = 30;

  const dateStr = getDateOffset(days);
  parts.push(`pushed:>${dateStr}`);

  const language = params.language ? params.language.trim() : "";
  if (language) {
    parts.push(`language:${language}`);
  }

  // Ensure we only get repositories with some community traction
  parts.push("stars:>10");

  return parts.join(" ");
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "websculpt-github-get-trending" } }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            const err = new Error("[PARSE_ERROR] Failed to parse GitHub API response");
            err.code = "PARSE_ERROR";
            reject(err);
          }
        } else if (res.statusCode === 403 || res.statusCode === 429) {
          const err = new Error("[RATE_LIMIT] GitHub API rate limit exceeded. Please try again later.");
          err.code = "RATE_LIMIT";
          reject(err);
        } else if (res.statusCode === 422) {
          const err = new Error("[INVALID_QUERY] GitHub API rejected the search query. Check your parameters.");
          err.code = "INVALID_QUERY";
          reject(err);
        } else {
          const err = new Error(`[API_ERROR] GitHub API returned HTTP ${res.statusCode}`);
          err.code = "API_ERROR";
          reject(err);
        }
      });
    });
    req.on("error", (e) => {
      const err = new Error(`[NETWORK_ERROR] ${e.message}`);
      err.code = "NETWORK_ERROR";
      reject(err);
    });
    req.setTimeout(15000, () => {
      req.destroy();
      const err = new Error("[TIMEOUT] Request to GitHub API timed out");
      err.code = "TIMEOUT";
      reject(err);
    });
  });
}

export default async function(params) {
  const limitRaw = params.limit || "10";
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 50) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 50");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const period = (params.period || "weekly").toLowerCase();
  if (!["daily", "weekly", "monthly"].includes(period)) {
    const err = new Error("[INVALID_PARAM] period must be one of: daily, weekly, monthly");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const query = buildQuery(params);
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.github.com/search/repositories?q=${encodedQuery}&sort=stars&order=desc&per_page=${limit}`;

  const data = await fetchJson(url);

  if (!data.items || !Array.isArray(data.items)) {
    const err = new Error("[EMPTY_RESULT] No repositories found for the given criteria");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const repositories = data.items.map((item, index) => ({
    rank: index + 1,
    name: item.name,
    full_name: item.full_name,
    owner: item.owner ? item.owner.login : null,
    owner_avatar: item.owner ? item.owner.avatar_url : null,
    description: item.description || "",
    stars: item.stargazers_count || 0,
    language: item.language || "",
    url: item.html_url,
    created_at: item.created_at,
    pushed_at: item.pushed_at,
  }));

  return {
    total_count: data.total_count || 0,
    query: query,
    period: period,
    limit: limit,
    repositories: repositories,
  };
}
