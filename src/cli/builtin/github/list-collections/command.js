// github/list-collections — GitHub curated Collections A-Z index from github.com/collections (browser runtime)
// Data path: page.goto → read the SSR-rendered DOM. The collections page is pure SSR (no hydration
// dependency), and the stable A-Z index is 20 fixed article cards. The page's top "featured"
// spotlight (3 cover cards) rotates and is deliberately excluded for reproducibility.

export default async (page, params, cwd) => {
  const limitStr = params.limit;

  // --- Parameter validation (before any page access) ---
  if (!/^\d+$/.test(limitStr)) {
    const err = new Error(
      `[INVALID_PARAM] limit must be an integer between 1 and 100. Got: "${params.limit}"`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(limitStr, 10);
  if (limit < 1 || limit > 100) {
    const err = new Error(
      `[INVALID_PARAM] limit must be an integer between 1 and 100. Got: ${limit}`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  const url = "https://github.com/collections";

  // --- Rate awareness: random delay before navigation ---
  await page.waitForTimeout(200 + Math.floor(Math.random() * 500));

  // --- Navigate ---
  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    const err = new Error(`[NETWORK_ERROR] Failed to load collections page: ${e.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // --- Fail-fast detection of blocked / not-found pages ---
  if (response) {
    if (response.status() === 404) {
      const err = new Error("[NOT_FOUND] github.com/collections returned HTTP 404.");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (response.status() === 429 || response.status() === 403) {
      const err = new Error(
        `[NETWORK_ERROR] GitHub rate-limited or blocked the request (HTTP ${response.status()}). Slow down and retry.`
      );
      err.code = "NETWORK_ERROR";
      throw err;
    }
  }
  const pageTitle = await page.title().catch(() => "");
  if (/Page not found|unusual traffic|captcha|rate limit|whoa there/i.test(pageTitle)) {
    const err = new Error("[NETWORK_ERROR] GitHub bot check or rate-limit page detected. Slow down and retry.");
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // --- Light polite-pacing gestures (random, must not slow down meaningfully) ---
  try {
    await page.mouse.move(30 + Math.floor(Math.random() * 470), 30 + Math.floor(Math.random() * 470));
    await page.mouse.wheel(0, Math.floor(Math.random() * 300));
  } catch (_) {
    /* non-fatal */
  }
  await page.waitForTimeout(120 + Math.floor(Math.random() * 350));

  // --- Extract the stable A-Z index cards from the SSR-rendered DOM ---
  const parsed = await page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText.slice(0, 800) : "";
    const antiBot = /whoa there|captcha|rate limit|access denied|unusual traffic/i.test(
      document.title + " " + bodyText
    );

    const cards = [...document.querySelectorAll("article.d-flex.border-bottom")];
    const collections = cards.map((card) => {
      const a = card.querySelector("h2.h3 a");
      const col = card.querySelector(".col-10");
      let description = "";
      if (col) {
        const clone = col.cloneNode(true);
        const h2 = clone.querySelector("h2");
        if (h2) h2.remove();
        description = clone.innerText.replace(/\s+/g, " ").trim();
      }
      return {
        title: a ? a.innerText.replace(/\s+/g, " ").trim() : null,
        description: description || null,
        url: a ? "https://github.com" + a.getAttribute("href") : null,
      };
    });

    return { antiBot, available: collections.length, collections };
  });

  if (parsed.antiBot) {
    const err = new Error(
      "[NETWORK_ERROR] GitHub rate-limit or bot check detected on github.com/collections. Slow down and retry."
    );
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (parsed.available === 0) {
    const err = new Error(
      "[DRIFT_DETECTED] No collection cards found on github.com/collections. The page structure may have changed."
    );
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  const available = parsed.available;
  const truncated = parsed.collections.slice(0, limit);
  const partial = limit < available;

  return {
    source: "github.com/collections",
    count: truncated.length,
    available,
    partial,
    collections: truncated,
  };
};
