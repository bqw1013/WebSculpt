// medium/list-topics
//
// Lists Medium topics from the official directory at https://medium.com/explore-topics.
//
// Modes:
//   - Directory mode (no --query): returns all topics grouped by top-level category.
//   - Search mode (--query provided): uses the page's "Search all topics" autocomplete.
//
// Parameters:
//   --query  Optional topic name to search via autocomplete.
//   --limit  Optional maximum number of topics to return (1-500).
//            Directory mode default: all topics.
//            Search mode default: 20.

/**
 * Returns a promise that resolves after a random delay within [min, max] ms.
 * Used to add small, non-uniform pauses.
 */
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs a small, random mouse movement within the viewport.
 */
async function jitterMouse(page) {
  try {
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const x = Math.floor(Math.random() * Math.min(viewport.width, 800));
    const y = Math.floor(Math.random() * Math.min(viewport.height, 600));
    await page.mouse.move(x, y);
  } catch {
    // Mouse jitter is best-effort; never fail the command because of it.
  }
}

/**
 * Scrolls the page a small random amount, best-effort.
 */
async function jitterScroll(page) {
  try {
    await page.evaluate(() => {
      const amount = Math.floor(Math.random() * 200) + 50;
      window.scrollBy(0, amount);
    });
  } catch {
    // Scroll jitter is best-effort.
  }
}

function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

export default async (page, params, cwd) => {
  // --query: optional search string for autocomplete mode.
  const query = (params.query || "").trim();
  const hasQuery = query.length > 0;

  // --limit: optional cap on returned topics. Must be a number between 1 and 500.
  let limit = null;
  if (params.limit && params.limit.trim().length > 0) {
    limit = parseInt(params.limit, 10);
    if (Number.isNaN(limit)) {
      throwError("INVALID_PARAM", "limit must be a number");
    }
    if (limit < 1 || limit > 500) {
      throwError("INVALID_PARAM", "limit must be between 1 and 500");
    }
  }

  const targetUrl = "https://medium.com/explore-topics";

  if (hasQuery) {
    // === Search / autocomplete mode ===
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await randomDelay(200, 500);
    await jitterMouse(page);

    // Wait for the "Search all topics" input.
    const searchInputSelector = 'input[placeholder*="Search all topics"]';
    await page.waitForSelector(searchInputSelector, { timeout: 15000 });

    // Fill the search box with the caller's query.
    await page.fill(searchInputSelector, query);
    await randomDelay(400, 900);

    // Wait for the autocomplete dropdown to appear, but do not fail if there are no matches.
    try {
      await page.waitForSelector('#searchResults', { timeout: 2500 });
      await randomDelay(200, 500);
    } catch {
      // No dropdown rendered yet; give it one more beat before reading results.
      await page.waitForTimeout(800);
    }

    // Helper to read current autocomplete results from the DOM.
    const readResults = () => page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('#searchResults a[href^="/tag/"]'));
      const seen = new Set();
      return links
        .map((a) => {
          const href = a.getAttribute("href") || "";
          const slug = href.replace("/tag/", "").split("?")[0];
          return {
            name: a.textContent.trim(),
            slug,
            url: `https://medium.com/tag/${slug}`,
          };
        })
        .filter((item) => {
          if (!item.slug || seen.has(item.slug)) return false;
          seen.add(item.slug);
          return true;
        });
    });

    let results = await readResults();

    // If results are still empty, wait a little longer once (autocomplete can be slow on first interaction).
    if (results.length === 0) {
      await page.waitForTimeout(800);
      results = await readResults();
    }

    const effectiveLimit = limit !== null ? limit : 20;
    const limited = results.slice(0, effectiveLimit);

    return {
      query,
      count: limited.length,
      topics: limited,
    };
  }

  // === Directory mode ===
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await randomDelay(200, 500);
  await jitterMouse(page);
  await jitterScroll(page);

  // Wait until at least one topic link is present as a sanity check.
  await page.waitForSelector('a[href^="/tag/"]', { timeout: 15000 });

  // Extract the full topic tree from the embedded Apollo state.
  const directory = await page.evaluate(() => {
    const state = window.__APOLLO_STATE__;
    if (!state) {
      return { error: "APOLLO_STATE_MISSING" };
    }

    const rootQuery = state["ROOT_QUERY"];
    if (!rootQuery || !rootQuery.rootTags) {
      return { error: "ROOT_TAGS_MISSING" };
    }

    const rootRefs = rootQuery.rootTags;
    if (!Array.isArray(rootRefs) || rootRefs.length === 0) {
      return { error: "ROOT_TAGS_EMPTY" };
    }

    function collectTopics(ref, visited = new Set()) {
      const key = ref && ref.__ref ? ref.__ref : ref;
      if (!key || visited.has(key)) return [];
      visited.add(key);

      const tag = state[key];
      if (!tag) return [];

      const topics = [];
      if (tag.normalizedTagSlug && tag.displayTitle) {
        topics.push({
          name: tag.displayTitle,
          slug: tag.normalizedTagSlug,
          url: `https://medium.com/tag/${tag.normalizedTagSlug}`,
        });
      }

      if (Array.isArray(tag.childTags)) {
        for (const child of tag.childTags) {
          topics.push(...collectTopics(child, visited));
        }
      }
      return topics;
    }

    const categories = [];
    for (const ref of rootRefs) {
      const key = ref && ref.__ref ? ref.__ref : ref;
      const rootTag = state[key];
      if (!rootTag) continue;

      const allTopics = collectTopics(key);
      // Keep every descendant topic, but exclude the root category itself.
      const childTopics = allTopics.filter((t) => t.slug !== rootTag.normalizedTagSlug);

      categories.push({
        category: rootTag.displayTitle || rootTag.normalizedTagSlug,
        slug: rootTag.normalizedTagSlug,
        topics: childTopics,
      });
    }

    return { categories };
  });

  if (directory.error) {
    throwError("DRIFT_DETECTED", `Expected directory structure not found: ${directory.error}`);
  }

  const categories = directory.categories || [];
  const effectiveLimit = limit !== null ? limit : Infinity;

  // Apply limit across categories in original order.
  let remaining = effectiveLimit;
  const limitedCategories = [];
  for (const cat of categories) {
    if (remaining <= 0) break;
    const take = Math.min(cat.topics.length, remaining);
    limitedCategories.push({
      category: cat.category,
      slug: cat.slug,
      topics: cat.topics.slice(0, take),
    });
    remaining -= take;
  }

  const totalTopics = limitedCategories.reduce((sum, c) => sum + c.topics.length, 0);

  return {
    count: totalTopics,
    categories: limitedCategories,
  };
};
