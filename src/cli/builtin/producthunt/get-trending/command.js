export default async (page, params) => {
  const limit = parseInt(params.limit, 10);

  function buildUrl(dateStr) {
    const [year, month, day] = dateStr.split("-");
    return `https://www.producthunt.com/leaderboard/daily/${year}/${parseInt(month, 10)}/${parseInt(day, 10)}`;
  }

  function dateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function fetchProducts(url) {
    // Use "load" (not "domcontentloaded") to wait for Cloudflare JS challenge
    // to execute and resolve. Product Hunt serves a Cloudflare interstitial on
    // first visit from a new browser session; "domcontentloaded" fires before
    // the challenge completes, causing false DRIFT_DETECTED.
    await page.goto(url, { waitUntil: "load", timeout: 30000 });

    try {
      // 30s timeout to accommodate Cloudflare challenge resolution (typically
      // 5-10s, but can be longer under poor network conditions).
      await page.waitForSelector('a[href^="/products/"]', { timeout: 30000 });
    } catch {
      const err = new Error("[DRIFT_DETECTED] Product cards not found — page structure may have changed or Cloudflare challenge not resolved");
      err.code = "DRIFT_DETECTED";
      throw err;
    }

    return page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="/products/"]');
      const items = [];
      const seen = new Set();

      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href || seen.has(href)) continue;

        // Skip non-leaderboard product links (footer recommendations, reviews, comments)
        if (href.includes("?") || href.includes("/reviews")) continue;

        seen.add(href);

        let card = link;
        for (let i = 0; i < 6; i++) {
          if (!card.parentElement) break;
          card = card.parentElement;
          if (card.className && card.className.includes("isolate")) break;
        }

        const lines = card.innerText
          .split("\n")
          .map(t => t.trim())
          .filter(t => t.length > 0 && t !== "•");

        if (lines.length < 2) continue;

        const titleLine = lines[0];
        const rankMatch = titleLine.match(/^(\d+)\.\s*(.+)$/);
        const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
        const title = rankMatch ? rankMatch[2] : titleLine;
        const tagline = lines[1] || "";

        let votes = null;
        const voteIdx = lines.findIndex(t => /^\d+$/.test(t));
        if (voteIdx !== -1) {
          votes = parseInt(lines[voteIdx], 10);
        }

        const topics = [];
        const endIdx = voteIdx !== -1 ? voteIdx : lines.length;
        for (let i = 2; i < endIdx; i++) {
          const t = lines[i];
          if (t && t !== "•" && !/^\d+$/.test(t)) {
            topics.push(t);
          }
        }

        const slug = href.replace("/products/", "").split("?")[0];

        items.push({
          rank,
          title,
          tagline,
          votes,
          topics,
          slug,
          url: `https://www.producthunt.com${href}`
        });
      }

      return items;
    });
  }

  let url, effectiveDate;

  if (params.date) {
    // Explicit date: use as-is, no fallback
    url = buildUrl(params.date);
    effectiveDate = params.date;
  } else {
    // No date specified: default to today
    effectiveDate = dateStr(new Date());
    url = buildUrl(effectiveDate);
  }

  let products = await fetchProducts(url);

  // Auto-fallback: when no explicit date is given and today's leaderboard
  // hasn't been published yet (common in non-PT timezones), fall back to
  // yesterday — which is nearly always available.
  if (!params.date && products.length === 0) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    effectiveDate = dateStr(yesterday);
    url = buildUrl(effectiveDate);
    products = await fetchProducts(url);
  }

  if (products.length === 0) {
    const err = new Error("[EMPTY_RESULT] No products found on the page");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Assign fallback rank by DOM order if missing, then sort
  products.forEach((p, i) => {
    if (p.rank === null) p.rank = i + 1;
  });
  products.sort((a, b) => a.rank - b.rank);

  const items = products.slice(0, limit);

  return {
    date: effectiveDate,
    url,
    items,
    count: items.length
  };
};
