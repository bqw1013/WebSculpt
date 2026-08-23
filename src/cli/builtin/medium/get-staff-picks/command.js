// Medium Staff Picks — official editorial curation list
// Reads the live Apollo Client cache after lazy-loading more items on scroll.
export default async (page, params, cwd) => {
  // Parse and validate limit (1-100). Default 20 is provided by manifest.
  const rawLimit = parseInt(params.limit, 10);
  if (isNaN(rawLimit)) {
    const err = new Error(
      "[INVALID_PARAM] --limit must be a valid integer between 1 and 100"
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = rawLimit;

  if (limit <= 0 || limit > 100) {
    const err = new Error(
      "[INVALID_PARAM] --limit must be between 1 and 100, got: " + limit
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Navigate to the official Staff Picks list page
  await page.goto(
    "https://medium.com/@MediumStaff/list/staff-picks-c7bc6e1ee00f",
    { waitUntil: "domcontentloaded" }
  );

  // Light warm-up: short pause, small mouse move, gentle scroll
  await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
  await page.mouse.move(
    80 + Math.floor(Math.random() * 240),
    120 + Math.floor(Math.random() * 200)
  );
  await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
  await page.evaluate(() => {
    window.scrollTo({
      top: Math.floor(window.innerHeight * 0.25 + Math.random() * 200),
      behavior: "smooth",
    });
  });
  await page.waitForTimeout(500 + Math.floor(Math.random() * 500));

  // Wait for Apollo Client to hydrate (live cache or SSR snapshot)
  try {
    await page.waitForFunction(
      () =>
        (window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache) ||
        (window.__APOLLO_STATE__ && window.__APOLLO_STATE__.ROOT_QUERY),
      { timeout: 15000 }
    );
  } catch {
    const err = new Error(
      "[PAGE_LOAD_FAILED] Apollo state did not hydrate within timeout"
    );
    err.code = "PAGE_LOAD_FAILED";
    throw err;
  }

  // Helper to inspect the live Apollo cache: raw loaded items + valid Post count
  const getCacheState = async () => {
    return await page.evaluate(() => {
      const catalogId = "c7bc6e1ee00f";
      const catalogKey = "Catalog:" + catalogId;
      const rootKey = 'catalogById({"catalogId":"' + catalogId + '"})';

      const cache =
        window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache
          ? window.__APOLLO_CLIENT__.cache.extract()
          : window.__APOLLO_STATE__;

      if (!cache) return { rawCount: 0, postCount: 0, hasNext: false, source: "none" };

      let catalog = cache[catalogKey];
      if (!catalog && cache.ROOT_QUERY && cache.ROOT_QUERY[rootKey]) {
        const ref = cache.ROOT_QUERY[rootKey];
        catalog = ref && ref.__ref ? cache[ref.__ref] : ref;
      }
      if (!catalog) return { rawCount: 0, postCount: 0, hasNext: false, source: "no_catalog" };

      const conn = catalog["itemsConnection:(limit:20)"];
      if (!conn || !Array.isArray(conn.items)) {
        return { rawCount: 0, postCount: 0, hasNext: false, source: "no_connection" };
      }

      let postCount = 0;
      for (const itemRef of conn.items) {
        if (!itemRef || !itemRef.__ref) continue;
        const catalogItem = cache[itemRef.__ref];
        if (!catalogItem || catalogItem.entityType !== "POST") continue;
        const entityRef = catalogItem.entity;
        if (!entityRef || !entityRef.__ref) continue;
        const post = cache[entityRef.__ref];
        if (post && post.__typename === "Post") postCount += 1;
      }

      const hasNext = !!(conn.paging && conn.paging.nextPageCursor);
      return { rawCount: conn.items.length, postCount, hasNext, source: "cache" };
    });
  };

  // If the caller wants more than the initial SSR batch, scroll to lazy-load.
  // Each scroll normally fetches ~20 more items via UserCatalogMainContentQuery.
  // We track the count of valid Posts (some catalog entries are not stories).
  if (limit > 20) {
    let lastPostCount = 0;
    let stalled = 0;
    const maxStalls = 3;

    while (true) {
      const status = await getCacheState();
      if (status.postCount >= limit) break;
      if (!status.hasNext && status.rawCount > 0) break; // list exhausted
      if (status.postCount === lastPostCount) {
        stalled += 1;
        if (stalled >= maxStalls) break;
      } else {
        stalled = 0;
        lastPostCount = status.postCount;
      }

      // Light micro-interactions before triggering the next load
      await page.waitForTimeout(200 + Math.floor(Math.random() * 400));
      await page.mouse.move(
        80 + Math.floor(Math.random() * 240),
        200 + Math.floor(Math.random() * 200)
      );

      // Scroll toward the bottom of the page to trigger the next lazy-load batch.
      // The target is randomized slightly to vary the reading position.
      await page.evaluate(() => {
        const target =
          document.body.scrollHeight -
          Math.floor(window.innerHeight * (0.5 + Math.random() * 0.4));
        window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      });

      // Wait for the GraphQL round-trip and DOM update
      await page.waitForTimeout(1000 + Math.floor(Math.random() * 800));
    }
  }

  // Extract up to `limit` valid Post items from the live cache (or SSR snapshot as fallback)
  const result = await page.evaluate((maxItems) => {
    const catalogId = "c7bc6e1ee00f";
    const catalogKey = "Catalog:" + catalogId;
    const rootKey = 'catalogById({"catalogId":"' + catalogId + '"})';

    const cache =
      window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache
        ? window.__APOLLO_CLIENT__.cache.extract()
        : window.__APOLLO_STATE__;

    if (!cache) {
      return { __error: "APOLLO_STATE_NOT_FOUND" };
    }

    let catalog = cache[catalogKey];
    if (!catalog && cache.ROOT_QUERY && cache.ROOT_QUERY[rootKey]) {
      const ref = cache.ROOT_QUERY[rootKey];
      catalog = ref && ref.__ref ? cache[ref.__ref] : ref;
    }
    if (!catalog) {
      return { __error: "CATALOG_NOT_FOUND" };
    }

    const itemsConnection = catalog["itemsConnection:(limit:20)"];
    if (!itemsConnection || !Array.isArray(itemsConnection.items)) {
      return { __error: "ITEMS_NOT_FOUND" };
    }

    const results = [];

    for (let i = 0; i < itemsConnection.items.length && results.length < maxItems; i++) {
      const itemRef = itemsConnection.items[i];
      if (!itemRef || !itemRef.__ref) continue;

      const catalogItem = cache[itemRef.__ref];
      if (!catalogItem || catalogItem.entityType !== "POST") continue;

      const entityRef = catalogItem.entity;
      if (!entityRef || !entityRef.__ref) continue;

      const post = cache[entityRef.__ref];
      if (!post || post.__typename !== "Post") continue;

      // Extract author
      let author = { name: "Unknown", username: "", url: "" };
      if (post.creator && post.creator.__ref) {
        const user = cache[post.creator.__ref];
        if (user) {
          author = {
            name: user.name || "Unknown",
            username: user.username || "",
            url: user.username
              ? "https://medium.com/@" + user.username
              : "",
          };
        }
      }

      // Extract tags
      const tags = [];
      if (Array.isArray(post.tags)) {
        for (const tagRef of post.tags) {
          if (tagRef && tagRef.__ref) {
            const tagData = cache[tagRef.__ref];
            if (tagData) {
              tags.push(tagData.displayTitle || tagData.id || "");
            }
          }
        }
      }

      // Extract preview image URL
      let previewImage = null;
      if (post.previewImage && post.previewImage.id) {
        previewImage =
          "https://miro.medium.com/v2/resize:fit:400/" + post.previewImage.id;
      }

      // Extract curator note
      let curatorNote = null;
      if (
        catalogItem.userAnnotation &&
        catalogItem.userAnnotation.annotation
      ) {
        curatorNote = catalogItem.userAnnotation.annotation;
      }

      results.push({
        rank: results.length + 1,
        title: post.title || "",
        subtitle:
          (post.extendedPreviewContent &&
            post.extendedPreviewContent.subtitle) ||
          "",
        url: post.mediumUrl || "",
        author,
        clapCount: typeof post.clapCount === "number" ? post.clapCount : 0,
        responseCount:
          post.postResponses && typeof post.postResponses.count === "number"
            ? post.postResponses.count
            : 0,
        readingTime:
          typeof post.readingTime === "number"
            ? Math.round(post.readingTime)
            : 0,
        publishedAt:
          typeof post.firstPublishedAt === "number"
            ? new Date(post.firstPublishedAt).toISOString()
            : "",
        tags,
        previewImage,
        curatorNote,
        isLocked: post.isLocked === true,
      });
    }

    return {
      items: results,
      partial: results.length < maxItems,
      available: itemsConnection.items.length,
    };
  }, limit);

  if (result && result.__error) {
    const code = result.__error;
    const err = new Error("[" + code + "] Failed to extract Staff Picks data");
    err.code = code;
    throw err;
  }

  if (!result.items || result.items.length === 0) {
    const err = new Error(
      "[EMPTY_RESULT] No Staff Picks items could be extracted"
    );
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Final short pause before returning
  await page.waitForTimeout(Math.floor(Math.random() * 1500));

  return {
    items: result.items,
    count: result.items.length,
    partial: result.partial || false,
    available: result.available,
  };
};
