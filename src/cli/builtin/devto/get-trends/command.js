function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

export default async (page, params, cwd) => {
  const tagParam = params.tag;

  if (tagParam !== undefined && tagParam !== null && tagParam !== "") {
    if (typeof tagParam !== "string") {
      throwError("INVALID_PARAM", "tag must be a string");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(tagParam)) {
      throwError(
        "INVALID_PARAM",
        "tag must be a simple slug without #, /, ?, spaces or special characters"
      );
    }
  }

  const tag = tagParam || null;
  const url = tag ? `https://dev.to/trending?tag=${encodeURIComponent(tag)}` : "https://dev.to/trending";

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    throwError("NETWORK_ERROR", `Failed to load ${url}: ${err.message}`);
  }

  try {
    await page.waitForSelector(".trend-card, nav[aria-label='Filter trends by tag']", {
      timeout: 10000,
    });
  } catch (err) {
    throwError("EMPTY_RESULT", "Trend page loaded but no recognizable content was found");
  }

  const result = await page.evaluate((requestedTag) => {
    function cleanText(text) {
      if (!text) return "";
      return text.replace(/\s+/g, " ").trim();
    }

    function buildObj(entries) {
      const out = {};
      for (const [key, value] of entries) {
        if (value !== null && value !== undefined) {
          out[key] = value;
        }
      }
      return out;
    }

    const cards = Array.from(document.querySelectorAll(".trend-card"));

    const availableTags = Array.from(
      document.querySelectorAll("nav[aria-label='Filter trends by tag'] a, nav a[href*='tag=']")
    )
      .map((a) => {
        const href = a.getAttribute("href") || "";
        const match = href.match(/[?&]tag=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : null;
      })
      .filter(Boolean);

    const uniqueAvailableTags = [...new Set(availableTags)];

    const extractedCards = cards.map((card) => {
      const tagLink = card.querySelector('a[href^="/t/"]');
      const tagText = tagLink ? cleanText(tagLink.innerText).replace("# ", "#") : null;
      const tagUrl = tagLink ? tagLink.href : null;

      const postsMatch = card.innerText.match(/(\d+) posts in the last 7 days/);
      const postsCount7d = postsMatch ? parseInt(postsMatch[1], 10) : null;

      const heading = card.querySelector("h2");
      const titleLink = heading?.querySelector("a");
      const title = heading ? cleanText(heading.innerText) : null;
      const trendUrl = titleLink?.href || null;

      const coverImg = card.querySelector("img");
      const coverImage = coverImg?.src || null;

      const summaryEl = card.querySelector("p");
      const summary = summaryEl ? cleanText(summaryEl.innerText) : null;

      const keyAreasHeading = Array.from(card.querySelectorAll("h4")).find((h) =>
        h.innerText.includes("Key Areas")
      );
      const keyAreas = keyAreasHeading
        ? Array.from(
            keyAreasHeading.nextElementSibling?.querySelectorAll("li") || []
          ).map((li) => cleanText(li.innerText))
        : [];

      const activeMatch = card.innerText.match(/Active ([^\n]+)/);
      const activeAgo = activeMatch ? cleanText(activeMatch[1]) : null;

      return buildObj([
        ["tag", tagText],
        ["tag_url", tagUrl],
        ["posts_count_7d", postsCount7d],
        ["title", title],
        ["trend_url", trendUrl],
        ["cover_image", coverImage],
        ["summary", summary],
        ["key_areas", keyAreas.length > 0 ? keyAreas : null],
        ["active_ago", activeAgo],
      ]);
    });

    return {
      url: window.location.href,
      requestedTag,
      availableTags: uniqueAvailableTags,
      cards: extractedCards,
    };
  }, tag);

  if (tag && !result.availableTags.includes(tag)) {
    throwError("INVALID_PARAM", `tag "${tag}" is not a recognized trend filter`);
  }

  if (result.cards.length === 0) {
    throwError("EMPTY_RESULT", "No trend cards found on the page");
  }

  return {
    source: "browser",
    url: result.url,
    tag: tag,
    available_tags: result.availableTags,
    trends: result.cards.filter((card) => {
      if (!tag) return true;
      return card.tag === `#${tag}`;
    }),
  };
};
