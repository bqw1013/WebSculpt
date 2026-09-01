// List DEV.to tags. Runtime: browser.
// Strategy: try the public Forem API first when no query is provided; on API
// failure (429/5xx/network error) fall back to extracting the /tags page.
// When a query is provided the API does not support server-side search, so we
// use the /tags?q=<query> page directly.

const BASE_URL = "https://dev.to";
const API_TAGS = "/api/tags";
const TAGS_PAGE = "/tags";

function makeError(message, code) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    throw makeError("limit must be an integer between 1 and 1000", "INVALID_PARAM");
  }
  return n;
}

function parsePostsCount(text) {
  if (!text) return null;
  const match = String(text).match(/([\d,]+)\s*post/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function omitNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

async function sleepRandom(page, min, max) {
  const ms = min + Math.floor(Math.random() * (max - min));
  await page.waitForTimeout(ms);
}

async function naturalInteraction(page) {
  // Small mouse movement and scroll as part of the page interaction.
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  const x = Math.min(200 + Math.floor(Math.random() * 400), viewport.width - 1);
  const y = Math.min(200 + Math.floor(Math.random() * 300), viewport.height - 1);
  await page.mouse.move(x, y);
  await sleepRandom(page, 200, 500);
  await page.evaluate(() => window.scrollBy(0, 100 + Math.floor(Math.random() * 200)));
  await sleepRandom(page, 200, 500);
}

async function fetchApiTags(page, limit) {
  return page.evaluate(async ({ apiUrl }) => {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText}`);
      err.status = res.status;
      err.statusText = res.statusText;
      throw err;
    }
    return res.json();
  }, { apiUrl: `${BASE_URL}${API_TAGS}?per_page=${limit}` });
}

async function extractTagsFromPage(page, query) {
  const url = query
    ? `${BASE_URL}${TAGS_PAGE}?q=${encodeURIComponent(query)}`
    : `${BASE_URL}${TAGS_PAGE}`;

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Give the page a moment to render the tag cards or the empty-state message.
  await sleepRandom(page, 300, 600);
  await naturalInteraction(page);

  // Wait for either tag cards or an empty-state indicator.
  try {
    await page.waitForSelector(".js-tag-card.tag-card", { timeout: 8000 });
  } catch {
    const isEmpty = await page.evaluate(() =>
      document.body.innerText.includes("No results match")
    );
    if (isEmpty) return [];
    // If no cards and no empty message, the page structure may have drifted.
    throw makeError("Expected tag cards were not found", "DRIFT_DETECTED");
  }

  const tags = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".js-tag-card.tag-card"));
    return cards.map((card) => {
      const link = card.querySelector("a.crayons-tag");
      const name = link
        ? link.innerText.replace(/^#/, "").trim()
        : "";

      const countEl = card.querySelector("div.fs-xs.color-base-60");
      const countText = countEl ? countEl.innerText.trim() : "";

      const summaryEl = card.querySelector("p.truncate-at-3");
      const summary = summaryEl ? summaryEl.innerText.trim() : "";

      let bg = null;
      const style = link ? link.getAttribute("style") || "" : "";
      const m = style.match(/--tag-prefix:\s*(#[0-9a-fA-F]{3,6})/);
      if (m) bg = m[1].toLowerCase();

      return { name, countText, summary, bg };
    });
  });

  return tags.map((t) =>
    omitNulls({
      name: t.name || null,
      short_summary: t.summary || null,
      bg_color_hex: t.bg,
      posts_count: parsePostsCount(t.countText),
    })
  ).filter((t) => t.name);
}

async function listTagsFromApi(page, limit) {
  let data;
  try {
    data = await fetchApiTags(page, limit);
  } catch (apiErr) {
    return { apiErr };
  }

  if (!Array.isArray(data)) {
    return { apiErr: new Error("unexpected API response shape") };
  }

  const tags = data.slice(0, limit).map((item) =>
    omitNulls({
      id: typeof item.id === "number" ? item.id : null,
      name: item.name || null,
      short_summary: item.short_summary || null,
      bg_color_hex: item.bg_color_hex || null,
      text_color_hex: item.text_color_hex || null,
    })
  );
  return { tags, source: "api" };
}

export default async (page, params, cwd) => {
  const limit = parseLimit(params.limit);
  const query = params.query ? String(params.query).trim() : "";

  if (query) {
    // The Forem API does not support server-side tag search, so use the page
    // search directly for more complete results.
    const tags = await extractTagsFromPage(page, query);
    if (tags.length === 0) {
      throw makeError(`No tags match the query "${query}"`, "EMPTY_RESULT");
    }
    return { source: "browser", tags: tags.slice(0, limit) };
  }

  const effectiveLimit = limit ?? 50;
  const apiResult = await listTagsFromApi(page, effectiveLimit);

  if (apiResult.tags) {
    if (apiResult.tags.length === 0) {
      throw makeError("No tags returned by the API", "EMPTY_RESULT");
    }
    return { source: apiResult.source, tags: apiResult.tags };
  }

  // API failed: fall back to the browser page.
  const tags = await extractTagsFromPage(page, "");
  if (tags.length === 0) {
    const code =
      apiResult.apiErr && apiResult.apiErr.status === 429
        ? "RATE_LIMITED"
        : "NETWORK_ERROR";
    throw makeError("API unreachable and browser fallback returned no tags", code);
  }
  return { source: "browser", tags: tags.slice(0, effectiveLimit) };
};
