export default async function(params) {
  const limit = parseInt(params.limit, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const res = await fetch("https://weibo.com/ajax/side/hotSearch", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://weibo.com/"
    }
  });

  if (!res.ok) {
    const err = new Error(`[NETWORK_ERROR] HTTP ${res.status}: ${res.statusText}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    const err = new Error(`[PARSE_ERROR] Failed to parse JSON response: ${e.message}`);
    err.code = "PARSE_ERROR";
    throw err;
  }

  if (json.ok !== 1) {
    const err = new Error(`[API_ERROR] Weibo API returned ok=${json.ok}`);
    err.code = "API_ERROR";
    throw err;
  }

  const realtime = json.data?.realtime || [];
  if (realtime.length === 0) {
    const err = new Error("[EMPTY_RESULT] No hot search items found");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const results = [];
  for (let i = 0; i < Math.min(limit, realtime.length); i++) {
    const item = realtime[i];
    const title = item.word || item.note || "";
    const heat = typeof item.num === "number" ? item.num : null;
    const tag = item.icon_desc || item.label_name || null;
    const rank = item.realpos || (i + 1);
    const searchWord = item.word_scheme || item.word || item.note || "";
    const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(searchWord)}`;

    results.push({ rank, title, heat, tag, url });
  }

  return results;
}
