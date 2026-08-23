// github/get-trending — real GitHub trending ranking from github.com/trending (browser runtime)
// Data path: same-origin fetch() of the raw SSR HTML + DOMParser.
// Rationale: the hydrated DOM of /trending is broken by a React error boundary
// ("Sorry, something went wrong." fallback), but the raw SSR HTML is complete.

const SINCE_VALUES = ["daily", "weekly", "monthly"];

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export default async (page, params, cwd) => {
  const since = params.since;
  const language = (params.language || "").trim() || null;
  const limitStr = params.limit;

  // --- Parameter validation (before any page access) ---
  if (!SINCE_VALUES.includes(since)) {
    const err = new Error(
      `[INVALID_PARAM] since must be one of: daily (今日), weekly (本周), monthly (本月). Got: "${since}"`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  if (!/^\d+$/.test(limitStr)) {
    const err = new Error(
      `[INVALID_PARAM] limit must be an integer between 1 and 25. Got: "${params.limit}"`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(limitStr, 10);
  if (limit < 1 || limit > 25) {
    const err = new Error(
      `[INVALID_PARAM] limit must be an integer between 1 and 25. Got: ${limit}`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  // --- Build URL: language -> /trending/{language} path; since -> ?since= ---
  let path = "/trending";
  if (language) {
    path += "/" + encodeURIComponent(language);
  }
  if (since !== "daily") {
    path += (path.includes("?") ? "&" : "?") + "since=" + since;
  }
  const url = "https://github.com" + path;

  // --- Navigate to establish github.com origin (cookies + same-origin fetch) ---
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (e) {
    const err = new Error(`[NETWORK_ERROR] Failed to load ${url}: ${e.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // --- Light polite-pacing gestures (random, must not slow down meaningfully) ---
  try {
    await page.mouse.move(randomInt(30, 500), randomInt(30, 500));
    await page.mouse.wheel(0, randomInt(0, 300));
  } catch (_) {
    /* non-fatal */
  }
  await new Promise((r) => setTimeout(r, randomInt(120, 350)));

  // --- Fetch raw SSR HTML (same origin) and extract cards ---
  const parsed = await page.evaluate(async () => {
    const resp = await fetch(location.pathname + location.search, {
      credentials: "same-origin",
    });
    const status = resp.status;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const title = doc.title || "";
    const bodyText = doc.body ? doc.body.innerText.slice(0, 600) : "";
    const antiBot =
      status === 429 ||
      status === 403 ||
      /whoa there|captcha|rate limit|access denied|unusual traffic/i.test(
        title + " " + bodyText
      );

    const cards = [...doc.querySelectorAll("article.Box-row")];
    const items = cards.map((card, i) => {
      const a = card.querySelector("h2 a");
      const descP = card.querySelector("p.col-9");
      const langEl = card.querySelector('[itemprop="programmingLanguage"]');
      const starA = card.querySelector('a[href*="/stargazers"]');
      const forkA = card.querySelector('a[href*="/forks"]');
      const meta = card.querySelector("div.f6");
      const gainSpan = meta
        ? [...meta.querySelectorAll("span")].find((s) =>
            /stars?\s+(today|this week|this month)/i.test(s.textContent || "")
          )
        : null;
      const builders = [
        ...card.querySelectorAll('a[data-hovercard-type="user"]'),
      ].map((b) => (b.getAttribute("href") || "").replace(/^\//, ""));

      return {
        rank: i + 1,
        full_name: a ? a.innerText.replace(/\s+/g, " ").trim() : null,
        html_url: a ? "https://github.com" + a.getAttribute("href") : null,
        description: descP
          ? descP.innerText.replace(/\s+/g, " ").trim() || null
          : null,
        language: langEl ? langEl.innerText.trim() || null : null,
        stars: starA
          ? parseInt(starA.innerText.replace(/[^\d]/g, ""), 10) || 0
          : 0,
        stars_gained: gainSpan
          ? parseInt(gainSpan.textContent.replace(/[^\d]/g, ""), 10) || 0
          : 0,
        forks: forkA
          ? parseInt(forkA.innerText.replace(/[^\d]/g, ""), 10) || 0
          : 0,
        builders,
      };
    });

    return { status, antiBot, available: items.length, items };
  });

  if (parsed.antiBot) {
    const err = new Error(
      `[NETWORK_ERROR] GitHub rate-limit or bot check detected (HTTP ${parsed.status}). Please slow down and retry later.`
    );
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (parsed.available === 0) {
    const err = new Error(
      `[EMPTY_RESULT] No trending repositories found for since=${since}` +
        (language ? `, language=${language}` : "") +
        "."
    );
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const available = parsed.available;
  const repositories = parsed.items.slice(0, limit);
  const partial = limit < available;

  return {
    source: "github.com/trending",
    since,
    language,
    count: repositories.length,
    available,
    partial,
    repositories,
  };
};
