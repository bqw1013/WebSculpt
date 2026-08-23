// github/get-topic — GitHub topic detail + featured repos from github.com/topics/{topic} (browser runtime)
// Data path: same-origin fetch() of the raw SSR HTML + DOMParser.
// Rationale: /topics/{topic} is pure SSR (header + up to 20 repo cards in the raw HTML).
// The hydrated DOM has transient INCLUDE-FRAGMENT side-widget errors; raw SSR is reliable.
// stars uses the span#repo-stars-counter-star `title` attribute (exact count), not the abbreviated visible text.

const TOPIC_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export default async (page, params, cwd) => {
  const topic = (params.topic || "").trim();
  const limitStr = params.limit;

  // --- Parameter validation (before any page access) ---
  if (!topic) {
    const err = new Error(
      "[INVALID_PARAM] topic is required: a GitHub topic slug like 'rust' or 'machine-learning'."
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  if (!TOPIC_SLUG_RE.test(topic)) {
    const err = new Error(
      `[INVALID_PARAM] topic must be a GitHub topic slug (lowercase letters, digits, hyphens), e.g. "rust", "machine-learning". Got: "${topic}"`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  if (!/^\d+$/.test(limitStr)) {
    const err = new Error(
      `[INVALID_PARAM] limit must be an integer between 1 and 100. Got: "${limitStr}"`
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

  // --- Build URL and navigate ---
  const url = "https://github.com/topics/" + encodeURIComponent(topic);
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

  // --- Fetch raw SSR HTML (same origin) and extract ---
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
    const notFound = status === 404 || /page not found/i.test(title);

    const h1 = doc.querySelector("h1.h1");
    const displayName = h1
      ? h1.textContent.replace(/\s+/g, " ").trim()
      : null;
    const descEl = doc.querySelector(".markdown-body.f5");
    const description = descEl
      ? descEl.textContent.replace(/\s+/g, " ").trim() || null
      : null;

    const emptyMsgEl = doc.querySelector("div.f3.color-fg-muted.lh-condensed");
    const isEmpty =
      !!emptyMsgEl &&
      /hasn.t been used on any public repositories/i.test(
        emptyMsgEl.textContent.replace(/\s+/g, " ")
      );

    const cards = [
      ...doc.querySelectorAll(
        "article.border.rounded.color-shadow-small.color-bg-subtle.tmp-my-4"
      ),
    ];
    const repositories = cards.map((card) => {
      const nameA = card.querySelector("a.Link.text-bold.wb-break-word");
      const descP = card.querySelector("p.color-fg-muted.mb-0");
      const langEl = card.querySelector(
        'span[itemprop="programmingLanguage"]'
      );
      const starsEl = card.querySelector('span[id^="repo-stars-counter-star"]');
      const fullName = nameA
        ? (nameA.getAttribute("href") || "").replace(/^\//, "")
        : null;
      const starsAttr =
        (starsEl && starsEl.getAttribute("title")) ||
        (starsEl && starsEl.getAttribute("aria-label")) ||
        "";
      return {
        full_name: fullName,
        html_url: fullName ? "https://github.com/" + fullName : null,
        description: descP
          ? descP.textContent.replace(/\s+/g, " ").trim() || null
          : null,
        language: langEl ? langEl.textContent.trim() || null : null,
        stars: starsAttr
          ? parseInt(starsAttr.replace(/[^\d]/g, ""), 10) || 0
          : 0,
      };
    });

    return {
      status,
      title,
      displayName,
      description,
      antiBot,
      notFound,
      isEmpty,
      available: repositories.length,
      repositories,
    };
  });

  if (parsed.antiBot) {
    const err = new Error(
      `[NETWORK_ERROR] GitHub rate-limit or bot check detected (HTTP ${parsed.status}). Please slow down and retry later.`
    );
    err.code = "NETWORK_ERROR";
    throw err;
  }
  if (parsed.notFound) {
    const err = new Error(
      `[NOT_FOUND] GitHub topic page not found for "${topic}" (HTTP ${parsed.status}).`
    );
    err.code = "NOT_FOUND";
    throw err;
  }
  if (parsed.isEmpty) {
    const err = new Error(
      `[EMPTY_RESULT] Topic "${topic}" has no public repositories yet (the page shows: this topic hasn't been used on any public repositories).`
    );
    err.code = "EMPTY_RESULT";
    throw err;
  }
  if (parsed.available === 0) {
    // HTTP 200 + 0 cards but no empty-state block -> page structure changed
    const err = new Error(
      "[DRIFT_DETECTED] Topic page loaded but no repository cards or empty-state block were found. GitHub may have changed the page structure."
    );
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  const repositories = parsed.repositories.slice(0, limit);

  return {
    topic,
    display_name: parsed.displayName,
    description: parsed.description,
    url: "https://github.com/topics/" + topic,
    count: repositories.length,
    repositories,
  };
};
