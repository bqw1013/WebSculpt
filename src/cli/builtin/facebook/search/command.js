// type 枚举取值（与 Facebook 搜索分类 tab 对应）：top=综合 / pages=公共主页 / groups=小组 / people=用户 / videos=视频 / events=活动
const TYPE_PATH = {
  top: "top",
  pages: "pages",
  groups: "groups",
  people: "people",
  videos: "videos",
  events: "events"
};

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function integerLimit(value) {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) fail("INVALID_PARAM", "limit must be a positive integer");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) fail("INVALID_PARAM", "limit must be at least 1");
  if (n > 100) fail("LIMIT_EXCEEDED", "limit must be at most 100");
  return n;
}

function pageUrl(query, type) {
  const path = TYPE_PATH[type];
  return `https://www.facebook.com/search/${path}/?q=${encodeURIComponent(query)}`;
}

function findSerp(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || depth > 18 || seen.has(value)) return null;
  seen.add(value);
  if (value.serpResponse?.results?.edges) return value.serpResponse;
  for (const child of Object.values(value)) {
    const result = findSerp(child, seen, depth + 1);
    if (result) return result;
  }
  return null;
}

function parseText(value) {
  return typeof value?.text === "string" ? value.text : null;
}

function normalizeStrategy(strategy, edge, role) {
  const vm = strategy?.view_model || {};
  const profile = vm.profile;
  if (profile && profile.id) {
    const snippet = parseText(vm.primary_snippet_text_with_entities);
    const descriptions = (vm.description_snippets_text_with_entities || []).map(parseText).filter(Boolean);
    return {
      id: String(profile.id),
      name: profile.name || null,
      title: profile.name || null,
      url: profile.profile_url || profile.url || null,
      image: profile.profile_picture?.uri || null,
      profileType: profile.__typename || null,
      snippet,
      description: descriptions.join("\n") || null,
      role: role || null,
      native: { edge, strategy }
    };
  }
  const story = vm.story || vm.click_model?.story || null;
  if (story) {
    const attachment = story.attachments?.[0]?.styles?.attachment;
    const message = parseText(story.message) || parseText(vm.message) || parseText(vm.text);
    return {
      id: String(story.post_id || story.id || ""),
      title: message,
      name: story.feedback?.owning_profile?.name || null,
      url: attachment?.url || story.permalink_url || null,
      image: attachment?.all_subattachments?.nodes?.[0]?.media?.image?.uri || null,
      profileType: "Story",
      snippet: message,
      publishedAt: story.creation_time ? new Date(story.creation_time * 1000).toISOString() : null,
      metrics: story.feedback || null,
      role: role || null,
      native: { edge, strategy }
    };
  }
  // SearchNativeVideoViewModel: video results carry neither profile nor story;
  // extract native video fields directly. relative_time_string is localized text,
  // not a unix timestamp, so no ISO date is fabricated.
  const videoMeta = vm.video_metadata_model;
  if (videoMeta && videoMeta.video?.id) {
    const thumbnail = vm.video_thumbnail_model || {};
    const click = vm.video_click_model?.click_metadata_model || {};
    const owner = videoMeta.video_owner_profile || {};
    let url = null;
    const relativeOpenUri = click.payload?.open_video_uri || null;
    if (relativeOpenUri) {
      try {
        const abs = new URL(relativeOpenUri, "https://www.facebook.com");
        abs.searchParams.delete("external_log_id");
        abs.searchParams.delete("q");
        url = abs.href;
      } catch (_) {
        url = null;
      }
    }
    if (!url) url = `https://www.facebook.com/watch/?v=${videoMeta.video.id}`;
    return {
      id: String(videoMeta.video.id),
      name: owner.name || null,
      title: videoMeta.title || null,
      url,
      image: thumbnail.thumbnail_image?.uri || null,
      profileType: "Video",
      snippet: videoMeta.save_description || null,
      duration: thumbnail.video_duration_text || null,
      timeText: videoMeta.relative_time_string || null,
      role: role || null,
      native: { edge, strategy }
    };
  }
  return null;
}

function recordsFromSerp(serp) {
  const rows = [];
  for (const edge of serp?.results?.edges || []) {
    const role = edge.node?.role || null;
    const strategy = edge.rendering_strategy;
    const nested = strategy?.result_rendering_strategies;
    if (Array.isArray(nested) && nested.length) {
      for (const child of nested) {
        const record = normalizeStrategy(child, edge, role);
        if (record) rows.push(record);
      }
    } else {
      const record = normalizeStrategy(strategy, edge, role);
      if (record) rows.push(record);
    }
  }
  return { rows, pageInfo: serp?.results?.page_info || serp?.results?.pageInfo || null };
}

async function readInlineSerp(page) {
  const texts = await page.locator("script").allTextContents();
  for (const text of texts) {
    if (!text || !text.includes("serpResponse")) continue;
    try {
      const serp = findSerp(JSON.parse(text));
      if (serp) return serp;
    } catch (_) {
      // Ignore unrelated scripts; a matching response may still arrive below.
    }
  }
  return null;
}

async function waitRandom(min, max) {
  const ms = Math.floor(min + Math.random() * (max - min + 1));
  await new Promise(resolve => setTimeout(resolve, ms));
}

export default async (page, params, cwd) => {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query) fail("MISSING_PARAM", "query is required");
  const type = String(params.type).toLowerCase();
  if (!TYPE_PATH[type]) fail("INVALID_PARAM", "type must be one of: top (综合), pages (公共主页), groups (小组), people (用户), videos (视频), events (活动)");
  const limit = integerLimit(params.limit);
  const sort = String(params.sort).toLowerCase();
  const time = String(params.time).toLowerCase();
  const ignoredParams = [];
  if (sort !== "default") ignoredParams.push(`sort=${sort}`);
  if (time !== "all") ignoredParams.push(`time=${time}`);

  const url = pageUrl(query, type);
  const payloads = [];
  let responseSeen = false;
  const onResponse = async response => {
    if (!response.url().includes("/api/graphql")) return;
    try {
      const data = await response.json();
      const serp = findSerp(data);
      if (serp) {
        responseSeen = true;
        payloads.push(serp);
      }
    } catch (_) {
      // Some Facebook responses are streamed/deferred; SSR data remains usable.
    }
  };
  page.on("response", onResponse);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitRandom(450, 850);
    const inline = await readInlineSerp(page);
    if (inline) payloads.unshift(inline);
    const rows = [];
    const seen = new Set();
    let pagesFetched = 0;
    let hasNext = false;
    let consumed = 0;
    for (const serp of payloads) {
      const parsed = recordsFromSerp(serp);
      pagesFetched += 1;
      hasNext = Boolean(parsed.pageInfo?.has_next_page || parsed.pageInfo?.hasNextPage);
      for (const row of parsed.rows) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
        if (rows.length >= limit) break;
      }
      if (rows.length >= limit) break;
      consumed += 1;
    }

    // Facebook loads the next cursor through the page itself; scroll serially and parse each response.
    let attempts = 0;
    while (rows.length < limit && hasNext && attempts < 8) {
      attempts += 1;
      await page.mouse.wheel(0, 1300 + Math.floor(Math.random() * 900));
      await waitRandom(500, 950);
      for (; consumed < payloads.length; consumed += 1) {
        const serp = payloads[consumed];
        const parsed = recordsFromSerp(serp);
        hasNext = Boolean(parsed.pageInfo?.has_next_page || parsed.pageInfo?.hasNextPage);
        pagesFetched += 1;
        for (const row of parsed.rows) {
          if (!row.id || seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
          if (rows.length >= limit) break;
        }
      }
      if (!responseSeen) break;
    }
    if (rows.length || payloads.length) {
      return {
        query,
        type,
        maxLimit: 100,
        resultCount: Math.min(rows.length, limit),
        pagesFetched: Math.max(1, pagesFetched),
        source: "api",
        fallbackUsed: false,
        ignoredParams,
        results: rows.slice(0, limit),
        nativeEnvelope: payloads[0] || null
      };
    }
  } finally {
    page.off("response", onResponse);
  }

  // Re-navigate before DOM fallback so a failed API path cannot leave stale content in place.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitRandom(500, 900);
  const body = await page.locator("body").innerText().catch(() => "");
  const noResults = /no results|没有找到|未找到|找不到|没有结果/i.test(body);
  const articles = page.locator('[role="feed"] [role="article"]');
  const count = await articles.count().catch(() => 0);
  if (!count && noResults) {
    return { query, type, maxLimit: 100, resultCount: 0, pagesFetched: 1, source: "api", fallbackUsed: false, ignoredParams, results: [], nativeEnvelope: null };
  }
  if (!count) fail("DRIFT_DETECTED", "Facebook search result structure was not found");
  const domRows = [];
  for (let i = 0; i < Math.min(count, limit); i += 1) {
    const item = articles.nth(i);
    const text = await item.innerText().catch(() => "");
    const links = await item.locator("a").evaluateAll(nodes => nodes.map(a => ({ text: a.innerText || null, href: a.href || null })));
    const image = await item.locator("img").first().getAttribute("src").catch(() => null);
    domRows.push({ id: links[0]?.href || `dom-${i}`, name: links[0]?.text || null, title: links[0]?.text || null, url: links[0]?.href || null, image, snippet: text || null, native: { text, links, image } });
  }
  return { query, type, maxLimit: 100, resultCount: domRows.length, pagesFetched: 1, source: "dom", fallbackUsed: true, partial: true, ignoredParams, results: domRows, nativeEnvelope: null };
};
