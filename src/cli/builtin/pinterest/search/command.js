// Pinterest search: Pins / Boards / Users by keyword.
// Verified in explore (2026-08-19): BaseSearchResource bookmark pagination,
// three scope URLs, related_queries chips selector, no sort/time UI.
const MAX_LIMIT = 100;

function errorWithCode(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  // Validate the raw string first; never truncate with parseInt.
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw errorWithCode("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a safe integer");
  }
  if (limit > MAX_LIMIT) {
    throw errorWithCode("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }
  return limit;
}

function parseType(value) {
  if (value === undefined || value === null || value === "") return "pin";
  const v = String(value).toLowerCase();
  if (v === "pin" || v === "pins") return "pin";
  if (v === "board" || v === "boards") return "board";
  if (v === "user" || v === "users") return "user";
  throw errorWithCode("INVALID_TYPE", "type must be one of: pin, board, user");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Random short wait 200-500ms (fingerprint diversity; no fixed long sleeps).
async function randomWait() {
  await sleep(200 + Math.floor(Math.random() * 300));
}

// Scroll to the bottom of the current content with a small random jitter, then
// wait 200-500ms. Reaching the bottom is what triggers Pinterest's next page
// (BaseSearchResource bookmark fetch); the jitter keeps the scroll non-uniform.
async function gentleScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    window.scrollBy(0, -Math.round(Math.random() * 40));
  });
  await randomWait();
}

function parseThousands(text) {
  const m = text.match(/([\d,]+(?:\.\d+)?)\s*(万)?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (m[2] === "万") n *= 10000;
  return Math.round(n);
}

function mapPinResult(r) {
  const images = r.images || {};
  const imageUrl =
    images.orig?.url || images["736x"]?.url || images["474x"]?.url || images["236x"]?.url || null;
  const hasSource = r.domain && !/Uploaded by user/i.test(r.domain);
  const reaction = r.reaction_counts && r.reaction_counts["1"];
  return {
    id: r.id || null,
    title: r.title || r.grid_title || null,
    description: r.description || null,
    imageUrl,
    sourceLink: hasSource ? r.link || null : null,
    creator: {
      username: (r.pinner && r.pinner.username) || null,
      displayName: (r.pinner && r.pinner.full_name) || null,
    },
    board: { name: (r.board && r.board.name) || null },
    pinUrl: r.id ? `https://www.pinterest.com/pin/${r.id}/` : null,
    reactionCount: typeof reaction === "number" ? reaction : null,
  };
}

function mapBoardResult(r) {
  return {
    id: r.id || null,
    name: r.name || null,
    owner: {
      username: (r.owner && r.owner.username) || null,
      displayName: (r.owner && r.owner.full_name) || null,
    },
    url: r.url ? `https://www.pinterest.com${r.url}` : null,
    pinCount: typeof r.pin_count === "number" ? r.pin_count : null,
    imageUrl: r.image_cover_hd_url || r.image_cover_url || null,
  };
}

// Collect pin/board results by intercepting BaseSearchResource responses and
// scrolling until the limit is reached or results are exhausted.
async function collectApiResults(page, kind, limit, url) {
  const items = [];
  const seen = new Set();
  const onResponse = async (response) => {
    try {
      const rUrl = response.url();
      if (!rUrl.includes("/resource/BaseSearchResource/get/")) return;
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;
      const json = await response.json();
      const rr = json && json.resource_response;
      if (!rr || !rr.data || !Array.isArray(rr.data.results)) return;
      for (const r of rr.data.results) {
        if (!r || !r.id || seen.has(r.id)) continue;
        const item = kind === "board" ? mapBoardResult(r) : mapPinResult(r);
        if (!item) continue;
        seen.add(r.id);
        items.push(item);
      }
    } catch (err) {
      // Ignore response parse errors; the DOM fallback covers failures.
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Wait briefly for the first API batch (up to ~6s).
    for (let i = 0; i < 30 && items.length === 0; i += 1) {
      await sleep(200);
    }
    let noGrowth = 0;
    while (items.length < limit) {
      const before = items.length;
      await gentleScroll(page);
      // Wait for the scroll-triggered next page (up to ~3s).
      for (let i = 0; i < 20 && items.length === before; i += 1) {
        await sleep(150);
      }
      if (items.length === before) {
        noGrowth += 1;
        // Adaptive slow-down when no new results arrive (throttle/exhaustion).
        await sleep(500 + Math.floor(Math.random() * 800));
      } else {
        noGrowth = 0;
      }
      if (noGrowth >= 3) break;
    }
  } finally {
    page.off("response", onResponse);
  }
  return items;
}

async function extractRelatedQueries(page) {
  try {
    return await page.evaluate(() =>
      [...document.querySelectorAll("[data-test-id=one-bar-module-3] [data-test-id=one-bar-pill]")]
        .map((c) => c.textContent.trim())
        .filter((t) => t.length > 0)
    );
  } catch (err) {
    return [];
  }
}

async function checkEmpty(page) {
  try {
    const bodyText = await page.evaluate(() => document.body.innerText || "");
    return /no results|未找到|没有结果|nothing found|没有任何/i.test(bodyText);
  } catch (err) {
    return false;
  }
}

// DOM fallback: collect unique pin cards (id/title/imageUrl/pinUrl) via scroll.
async function collectPinsFromDom(page, limit) {
  const seen = new Set();
  const items = [];
  const extract = async () => {
    const cards = await page.evaluate(() => {
      const cleanTitle = (t) => (t ? t.replace(/\s*Pin 图页面$/, "").trim() : null);
      return [...document.querySelectorAll("[data-test-id=pin]")]
        .map((pin) => {
          const id = pin.getAttribute("data-test-pin-id");
          const link = [...pin.querySelectorAll("a")].find((a) => (a.getAttribute("href") || "").includes("/pin/"));
          const img = pin.querySelector("img");
          const srcset = img ? img.getAttribute("srcset") || "" : "";
          const origMatch = srcset.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s]+/);
          const title = link ? link.getAttribute("aria-label") : img ? img.alt : null;
          return {
            id,
            title: cleanTitle(title),
            imageUrl: origMatch ? origMatch[0] : img ? img.currentSrc || img.src || null : null,
            pinUrl: id ? `https://www.pinterest.com/pin/${id}/` : null,
          };
        })
        .filter((c) => c.id);
    });
    let added = 0;
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      items.push({
        ...c,
        description: null,
        sourceLink: null,
        creator: { username: null, displayName: null },
        board: { name: null },
        reactionCount: null,
      });
      added += 1;
    }
    return added;
  };
  await extract();
  let noGrowth = 0;
  while (items.length < limit) {
    const before = items.length;
    await gentleScroll(page);
    const added = await extract();
    if (added === 0) {
      noGrowth += 1;
      await sleep(500 + Math.floor(Math.random() * 800));
    } else {
      noGrowth = 0;
    }
    if (noGrowth >= 3) break;
  }
  return items.slice(0, limit);
}

// DOM fallback: collect unique board cards via scroll.
async function collectBoardsFromDom(page, limit) {
  const seen = new Set();
  const items = [];
  const extract = async () => {
    const cards = await page.evaluate(() => {
      return [...document.querySelectorAll("[data-test-id=board-card]")]
        .map((card) => {
          const link = card.querySelector("a[href^=\"/\"]");
          const href = link ? link.getAttribute("href") : null;
          const img = card.querySelector("img");
          const lines = (card.innerText || "")
            .trim()
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          const pinCountLine = lines.find((l) => l.includes("张 Pin 图")) || "";
          return {
            name: lines[0] || null,
            ownerName: lines[1] || null,
            href,
            pinCountText: pinCountLine,
            imageUrl: img ? img.currentSrc || img.src || null : null,
          };
        })
        .filter((c) => c.href);
    });
    let added = 0;
    for (const c of cards) {
      if (seen.has(c.href)) continue;
      seen.add(c.href);
      const username = c.href.replace(/^\/|\/$/g, "").split("/")[0] || null;
      items.push({
        id: null,
        name: c.name,
        owner: { username, displayName: c.ownerName },
        url: c.href ? `https://www.pinterest.com${c.href}` : null,
        pinCount: parseThousands(c.pinCountText),
        imageUrl: c.imageUrl,
      });
      added += 1;
    }
    return added;
  };
  await extract();
  let noGrowth = 0;
  while (items.length < limit) {
    const before = items.length;
    await gentleScroll(page);
    const added = await extract();
    if (added === 0) {
      noGrowth += 1;
      await sleep(500 + Math.floor(Math.random() * 800));
    } else {
      noGrowth = 0;
    }
    if (noGrowth >= 3) break;
  }
  return items.slice(0, limit);
}

// User search: DOM accumulation (SSR + scroll). User id is not in card DOM.
async function collectUsersFromDom(page, limit) {
  const seen = new Set();
  const items = [];
  const extract = async () => {
    const cards = await page.evaluate(() => {
      return [...document.querySelectorAll("[data-test-id=user-rep-with-card]")]
        .map((card) => {
          const link = card.querySelector("a[href^=\"/\"]");
          const href = link ? link.getAttribute("href") : null;
          const img = card.querySelector("img");
          const lines = (card.innerText || "")
            .trim()
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          return {
            username: href ? href.replace(/^\/|\/$/g, "") : null,
            ariaLabel: link ? link.getAttribute("aria-label") || "" : "",
            lines,
            avatarUrl: img ? img.currentSrc || img.src || null : null,
          };
        })
        .filter((c) => c.username);
    });
    let added = 0;
    for (const c of cards) {
      if (seen.has(c.username)) continue;
      seen.add(c.username);
      const followerLine = c.lines.find((l) => l.includes("位粉丝")) || "";
      const displayName = c.ariaLabel
        ? c.ariaLabel.replace(/^个人资料\s*/, "")
        : c.lines[0] || null;
      items.push({
        id: null,
        username: c.username,
        displayName: displayName || null,
        followerCount: parseThousands(followerLine),
        avatarUrl: c.avatarUrl,
        profileUrl: `https://www.pinterest.com/${c.username}/`,
      });
      added += 1;
    }
    return added;
  };
  await extract();
  let noGrowth = 0;
  while (items.length < limit) {
    const before = items.length;
    await gentleScroll(page);
    const added = await extract();
    if (added === 0) {
      noGrowth += 1;
      await sleep(500 + Math.floor(Math.random() * 800));
    } else {
      noGrowth = 0;
    }
    if (noGrowth >= 3) break;
  }
  return items.slice(0, limit);
}

export default async (page, params, cwd) => {
  const query = String(params.query || "").trim();
  if (!query) throw errorWithCode("MISSING_PARAM", "query is required");
  const type = parseType(params.type);
  const limit = parseLimit(params.limit);

  const scope = type === "pin" ? "pins" : type === "board" ? "boards" : "users";
  const url = `https://www.pinterest.com/search/${scope}/?q=${encodeURIComponent(query)}`;

  // ---- User search (DOM-based) ----
  if (type === "user") {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-test-id=user-rep-with-card]", { timeout: 15000 }).catch(() => null);
    const hasCards = await page.locator("[data-test-id=user-rep-with-card]").count();
    if (hasCards > 0) {
      const items = await collectUsersFromDom(page, limit);
      return {
        query,
        type,
        related_queries: [],
        items,
        count: items.length,
        partial: items.length < limit,
        maxLimit: MAX_LIMIT,
      };
    }
    if (await checkEmpty(page)) {
      return { query, type, related_queries: [], items: [], count: 0, partial: true, maxLimit: MAX_LIMIT };
    }
    throw errorWithCode("DRIFT_DETECTED", "Pinterest user result selector was not found");
  }

  // ---- Pin / Board search (API-first with DOM fallback) ----
  const selector = type === "pin" ? "[data-test-id=pin]" : "[data-test-id=board-card]";
  let items = await collectApiResults(page, type, limit, url);

  if (items.length === 0) {
    await page.waitForSelector(selector, { timeout: 15000 }).catch(() => null);
    const hasCards = await page.locator(selector).count();
    if (hasCards > 0) {
      items = type === "pin" ? await collectPinsFromDom(page, limit) : await collectBoardsFromDom(page, limit);
    } else if (await checkEmpty(page)) {
      const relatedQueries = type === "pin" ? await extractRelatedQueries(page) : [];
      return {
        query,
        type,
        related_queries: relatedQueries,
        items: [],
        count: 0,
        partial: true,
        maxLimit: MAX_LIMIT,
      };
    } else {
      throw errorWithCode("DRIFT_DETECTED", `Pinterest ${type} result selector was not found`);
    }
  }

  const relatedQueries = type === "pin" ? await extractRelatedQueries(page) : [];
  const returned = items.slice(0, limit);
  return {
    query,
    type,
    related_queries: relatedQueries,
    items: returned,
    count: returned.length,
    partial: items.length < limit,
    maxLimit: MAX_LIMIT,
  };
};
