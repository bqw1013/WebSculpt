const makeError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const parseLimit = (value) => {
  const raw = String(value ?? "");
  if (!/^\d+$/.test(raw)) {
    throw makeError("INVALID_PARAM", "limit must be an integer from 1 to 50");
  }
  const limit = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw makeError("INVALID_PARAM", "limit must be an integer from 1 to 50");
  }
  return limit;
};

const extractRows = async (page) => {
  try {
    return await page.$$eval("tr.athing", (rows) => rows.map((row) => {
      const sub = row.nextElementSibling?.querySelector(".subtext");
      const titleLink = row.querySelector(".titleline a");
      const age = sub?.querySelector(".age");
      const ageLink = age?.querySelector("a");
      const itemLink = [...(sub?.querySelectorAll("a") || [])]
        .find((link) => /comments?|discuss/i.test(link.textContent || "") && link.href.includes("/item?id="));
      const titleHref = titleLink?.getAttribute("href") || "";
      const absoluteTitleUrl = titleLink ? new URL(titleHref, location.origin).href : null;
      const storyId = Number.parseInt(row.id, 10);
      const rank = Number.parseInt(row.querySelector(".rank")?.textContent || "", 10);
      const points = Number.parseInt((sub?.querySelector(".score")?.textContent || "").replace(/[^0-9]/g, ""), 10);
      const commentText = itemLink?.textContent?.trim() || "";
      const commentMatch = commentText.match(/([0-9,]+)\s+comments?/i);
      const numComments = commentMatch ? Number.parseInt(commentMatch[1].replace(/,/g, ""), 10) : 0;
      const timestamp = age?.getAttribute("title")?.trim().split(/\s+/)[0] || null;
      const hnUrl = itemLink?.href || ageLink?.href || `https://news.ycombinator.com/item?id=${storyId}`;
      const isTextPost = Boolean(absoluteTitleUrl && /\/item\?id=/.test(absoluteTitleUrl));

      return {
        pageRank: Number.isSafeInteger(rank) ? rank : null,
        storyId: Number.isSafeInteger(storyId) ? storyId : null,
        title: titleLink?.textContent?.trim() || null,
        url: isTextPost ? null : absoluteTitleUrl,
        hnUrl,
        author: sub?.querySelector(".hnuser")?.textContent?.trim() || null,
        createdAt: timestamp,
        points: Number.isSafeInteger(points) ? points : 0,
        numComments: Number.isSafeInteger(numComments) ? numComments : 0,
        isTextPost,
      };
    }));
  } catch {
    throw makeError("DRIFT_DETECTED", "Show HN story row structure could not be parsed");
  }
};

const loadPage = async (page, pageNumber) => {
  const url = pageNumber === 1
    ? "https://news.ycombinator.com/show"
    : `https://news.ycombinator.com/show?p=${pageNumber}`;
  let response;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch {
    throw makeError("NETWORK_ERROR", `Unable to load Hacker News Show page ${pageNumber}`);
  }
  const status = response?.status?.() ?? 200;
  if (status === 429) {
    throw makeError("RATE_LIMITED", "Hacker News rate limited the Show page request");
  }
  if (status >= 400) {
    throw makeError("NETWORK_ERROR", `Hacker News Show page returned HTTP ${status}`);
  }
  try {
    await page.waitForSelector("tr.athing", { timeout: 15000 });
  } catch {
    throw makeError("DRIFT_DETECTED", "Expected Show HN story rows were not found");
  }
  const rows = await extractRows(page);
  if (rows.length === 0) {
    throw makeError("EMPTY_RESULT", "Hacker News returned no Show HN stories");
  }
  const malformed = rows.find((row) => !row.storyId || !row.title || !row.hnUrl || !row.author || !row.createdAt);
  if (malformed) {
    throw makeError("DRIFT_DETECTED", "A Show HN story row is missing a required field");
  }
  const moreHref = await page.locator("a.morelink").getAttribute("href").catch(() => null);
  return { rows, hasMore: Boolean(moreHref) };
};

export default async (page, params, cwd) => {
  const limit = parseLimit(params.limit);
  const items = [];
  const seen = new Set();
  let pageNumber = 1;

  while (items.length < limit) {
    const { rows, hasMore } = await loadPage(page, pageNumber);
    for (const row of rows) {
      if (seen.has(row.storyId)) continue;
      seen.add(row.storyId);
      items.push({
        rank: items.length + 1,
        storyId: row.storyId,
        title: row.title,
        url: row.url,
        hnUrl: row.hnUrl,
        author: row.author,
        createdAt: row.createdAt,
        points: row.points,
        numComments: row.numComments,
        isTextPost: row.isTextPost,
      });
      if (items.length >= limit) break;
    }
    if (items.length >= limit || !hasMore) break;
    pageNumber += 1;
  }

  if (items.length === 0) {
    throw makeError("EMPTY_RESULT", "Hacker News returned no Show HN stories");
  }
  return items;
};
