export default async function(params) {
  const limit = parseInt(params.limit, 10);
  if (isNaN(limit) || limit < 1) {
    const err = new Error("[INVALID_PARAM] limit must be a positive integer");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const url = "https://s.search.bilibili.com/main/hotword";
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    }
  });

  if (!resp.ok) {
    const err = new Error(`[NETWORK_ERROR] HTTP ${resp.status}: ${resp.statusText}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  const data = await resp.json();

  if (data.code !== 0) {
    const err = new Error(`[API_ERROR] Bilibili API returned code ${data.code}`);
    err.code = "API_ERROR";
    throw err;
  }

  if (!data.list || data.list.length === 0) {
    const err = new Error("[EMPTY_RESULT] No hot search items returned");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const items = data.list.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    keyword: item.keyword || "",
    show_name: item.show_name || item.keyword || "",
    heat_score: item.heat_score || 0,
    heat_layer: item.heat_layer || "",
    word_type: item.word_type || 0,
    icon: item.icon || ""
  }));

  return {
    items,
    count: items.length,
    source: "bilibili-hotword"
  };
}
