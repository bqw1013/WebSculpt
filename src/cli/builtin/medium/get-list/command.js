// medium/get-list
// Fetch the metadata and articles of any public Medium list by URL.
//
// Data source: the page's embedded Apollo Client state (`window.__APOLLO_STATE__`
// and the live Apollo Client cache). Medium internally calls these "Catalog";
// the list entity is `Catalog:<listId>` and its items are `CatalogItemV2` nodes
// that reference `Post` entities. The first ~20 items come from SSR; subsequent
// batches are fetched via `/_/graphql` as the user scrolls. We simulate gentle
// scrolling until the requested limit is loaded or the list is exhausted.
//
// Polite pacing: random short waits, small mouse moves, and smooth small
// scrolls after page load and between lazy-load batches.

// Extract the 12-character hex listId from a public Medium list URL.
// Supported shape: https://medium.com/@<user>/list/<slug>-<listId>
function parseListUrl(input) {
  if (!input || typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    if (url.hostname.toLowerCase() !== "medium.com") return null;
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length !== 3) return null;
    if (!/^@.+/.test(parts[0])) return null;
    if (parts[1] !== "list") return null;
    const m = parts[2].match(/-([a-f0-9]{12})$/i);
    if (!m) return null;
    return {
      listId: m[1].toLowerCase(),
      username: parts[0].slice(1),
      slug: parts[2].slice(0, -m[0].length),
      canonicalUrl: "https://medium.com/" + parts[0] + "/list/" + parts[2],
    };
  } catch {
    return null;
  }
}

export default async (page, params, cwd) => {
  // ---------- Parameter validation (before any page access) ----------

  const parsed = parseListUrl(params.url);
  if (!parsed) {
    const err = new Error(
      "[INVALID_PARAM] --url must be a public Medium list URL in the form https://medium.com/@<user>/list/<slug>-<listId>. Got: " +
        (params.url || "(missing)")
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  const { listId, canonicalUrl } = parsed;

  const rawLimit = parseInt(params.limit, 10); // manifest default: "20"
  if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    const err = new Error(
      "[INVALID_PARAM] --limit must be an integer between 1 and 100. Got: " +
        params.limit
    );
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = rawLimit;

  // ---------- Load the list page ----------

  await page.goto(canonicalUrl, { waitUntil: "domcontentloaded" });

  // Polite warm-up: short pause, small mouse move, gentle scroll.
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

  // Wait for Apollo Client to hydrate (live cache or SSR snapshot).
  try {
    await page.waitForFunction(
      () =>
        (window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache) ||
        (window.__APOLLO_STATE__ && window.__APOLLO_STATE__.ROOT_QUERY),
      { timeout: 15000 }
    );
  } catch {
    const err = new Error(
      "[PAGE_LOAD_FAILED] Apollo state did not hydrate within timeout for " +
        canonicalUrl
    );
    err.code = "PAGE_LOAD_FAILED";
    throw err;
  }

  // Fail fast if Medium rendered its 404 page.
  await page.waitForTimeout(300 + Math.random() * 300);
  const is404 = await page.evaluate(() =>
    /PAGE NOT FOUND/i.test(document.body ? document.body.innerText : "")
  );
  if (is404) {
    const err = new Error(
      "[NOT_FOUND] Medium returned its 404 page for list URL " +
        canonicalUrl +
        ". Check that the list exists and is public."
    );
    err.code = "NOT_FOUND";
    throw err;
  }

  // ---------- Helper: read current cache status ----------

  const getCacheStatus = async () => {
    return await page.evaluate((id) => {
      const catalogKey = "Catalog:" + id;
      const rootKey = 'catalogById({"catalogId":"' + id + '"})';

      const cache =
        window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache
          ? window.__APOLLO_CLIENT__.cache.extract()
          : window.__APOLLO_STATE__;

      if (!cache) return { ok: false, reason: "no_cache" };

      let catalog = cache[catalogKey];
      if (!catalog && cache.ROOT_QUERY && cache.ROOT_QUERY[rootKey]) {
        const ref = cache.ROOT_QUERY[rootKey];
        if (ref && ref.__ref) catalog = cache[ref.__ref];
        else if (ref && ref.__typename === "NotFound") {
          return { ok: false, reason: "not_found" };
        }
      }
      if (!catalog) return { ok: false, reason: "no_catalog" };
      if (catalog.__typename === "NotFound") {
        return { ok: false, reason: "not_found" };
      }

      const conn = catalog["itemsConnection:(limit:20)"];
      if (!conn || !Array.isArray(conn.items)) {
        return { ok: false, reason: "no_connection" };
      }

      const hasNext = !!(conn.paging && conn.paging.nextPageCursor);
      return {
        ok: true,
        count: conn.items.length,
        hasNext,
      };
    }, listId);
  };

  // ---------- Lazy-load more items if needed ----------

  if (limit > 20) {
    let lastCount = 0;
    let stalled = 0;
    const maxStalls = 3;

    while (true) {
      const status = await getCacheStatus();
      if (!status.ok) break;
      if (status.count >= limit) break;
      if (!status.hasNext && status.count > 0) break; // exhausted
      if (status.count === lastCount) {
        stalled += 1;
        if (stalled >= maxStalls) break;
      } else {
        stalled = 0;
        lastCount = status.count;
      }

      // Polite micro-interactions before triggering the next load.
      await page.waitForTimeout(200 + Math.floor(Math.random() * 400));
      await page.mouse.move(
        80 + Math.floor(Math.random() * 240),
        200 + Math.floor(Math.random() * 200)
      );

      // Scroll toward the bottom of the page to trigger the next lazy-load batch.
      await page.evaluate(() => {
        const target =
          document.body.scrollHeight -
          Math.floor(window.innerHeight * (0.5 + Math.random() * 0.4));
        window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      });

      // Wait for the GraphQL round-trip and DOM/cache update.
      await page.waitForTimeout(1000 + Math.floor(Math.random() * 800));
    }
  }

  // ---------- Extract structured data from the cache ----------

  const extracted = await page.evaluate(
    ({ listId, limit, canonicalUrl }) => {
      const catalogKey = "Catalog:" + listId;
      const rootKey = 'catalogById({"catalogId":"' + listId + '"})';

      const cache =
        window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache
          ? window.__APOLLO_CLIENT__.cache.extract()
          : window.__APOLLO_STATE__;

      if (!cache) return { __error: "APOLLO_STATE_NOT_FOUND" };

      let catalog = cache[catalogKey];
      if (!catalog && cache.ROOT_QUERY && cache.ROOT_QUERY[rootKey]) {
        const ref = cache.ROOT_QUERY[rootKey];
        catalog = ref && ref.__ref ? cache[ref.__ref] : ref;
      }
      if (!catalog) return { __error: "CATALOG_NOT_FOUND" };
      if (catalog.__typename === "NotFound") {
        return { __error: "NOT_FOUND" };
      }

      const itemsConnection = catalog["itemsConnection:(limit:20)"];
      if (!itemsConnection || !Array.isArray(itemsConnection.items)) {
        return { __error: "ITEMS_NOT_FOUND" };
      }

      // Helper to build a Medium CDN image URL.
      const miro = (imageId, size) =>
        imageId
          ? "https://miro.medium.com/v2/resize:fit:" + size + "/" + imageId
          : null;

      // Curator info.
      let curator = { name: "", username: "", profileUrl: "" };
      if (catalog.creator && catalog.creator.__ref) {
        const user = cache[catalog.creator.__ref];
        if (user) {
          curator = {
            name: user.name || "",
            username: user.username || "",
            profileUrl: user.username
              ? "https://medium.com/@" + user.username
              : "",
          };
        }
      }

      const listMeta = {
        title: catalog.name || "",
        url: canonicalUrl,
        description: catalog.description || null,
        curator,
        itemCount:
          typeof catalog.postItemsCount === "number"
            ? catalog.postItemsCount
            : null,
        responseCount:
          typeof catalog.responsesCount === "number"
            ? catalog.responsesCount
            : null,
        clapCount:
          typeof catalog.clapCount === "number" ? catalog.clapCount : null,
        clappersCount:
          typeof catalog.clappersCount === "number"
            ? catalog.clappersCount
            : null,
        thumbnailImageUrl: catalog.thumbnailImage
          ? miro(catalog.thumbnailImage, 400)
          : null,
        createdAt:
          typeof catalog.createdAt === "number"
            ? new Date(catalog.createdAt).toISOString()
            : null,
        lastInsertedAt:
          typeof catalog.itemsLastInsertedAt === "number"
            ? new Date(catalog.itemsLastInsertedAt).toISOString()
            : null,
      };

      const itemRefs = itemsConnection.items.slice(0, limit);
      const articles = [];

      for (let i = 0; i < itemRefs.length; i++) {
        const itemRef = itemRefs[i];
        if (!itemRef || !itemRef.__ref) continue;

        const catalogItem = cache[itemRef.__ref];
        if (!catalogItem || catalogItem.entityType !== "POST") continue;

        const entityRef = catalogItem.entity;
        if (!entityRef || !entityRef.__ref) continue;

        const post = cache[entityRef.__ref];
        if (!post || post.__typename !== "Post") continue;

        // Author.
        let author = { name: "", username: "", profileUrl: "" };
        if (post.creator && post.creator.__ref) {
          const user = cache[post.creator.__ref];
          if (user) {
            author = {
              name: user.name || "",
              username: user.username || "",
              profileUrl: user.username
                ? "https://medium.com/@" + user.username
                : "",
            };
          }
        }

        // Tags.
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

        // Preview image.
        let previewImageUrl = null;
        if (post.previewImage && post.previewImage.id) {
          previewImageUrl = miro(post.previewImage.id, 400);
        }

        // Curator note.
        let curatorNote = null;
        if (
          catalogItem.userAnnotation &&
          typeof catalogItem.userAnnotation.annotation === "string"
        ) {
          curatorNote = catalogItem.userAnnotation.annotation;
        }

        articles.push({
          rank: i + 1,
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
          readingTimeMinutes:
            typeof post.readingTime === "number"
              ? Math.round(post.readingTime)
              : 0,
          publishedAt:
            typeof post.firstPublishedAt === "number"
              ? new Date(post.firstPublishedAt).toISOString()
              : "",
          updatedAt:
            typeof post.latestPublishedAt === "number"
              ? new Date(post.latestPublishedAt).toISOString()
              : "",
          tags,
          previewImageUrl,
          curatorNote,
          isMemberOnly: post.isLocked === true,
        });
      }

      return {
        list: listMeta,
        articles,
        partial: limit > articles.length,
        available: itemsConnection.items.length,
      };
    },
    { listId, limit, canonicalUrl }
  );

  if (extracted && extracted.__error) {
    const code = extracted.__error;
    const messages = {
      APOLLO_STATE_NOT_FOUND:
        "[DRIFT_DETECTED] window.__APOLLO_STATE__ not found; Medium's page structure changed.",
      CATALOG_NOT_FOUND:
        "[DRIFT_DETECTED] List catalog missing from Apollo state for " +
        canonicalUrl,
      ITEMS_NOT_FOUND:
        "[DRIFT_DETECTED] Catalog items connection missing from Apollo state.",
      NOT_FOUND: "[NOT_FOUND] List not found: " + canonicalUrl,
    };
    const err = new Error(messages[code] || "[" + code + "] Extraction failed");
    err.code = code === "APOLLO_STATE_NOT_FOUND" ? "DRIFT_DETECTED" : code;
    throw err;
  }

  if (!extracted.articles || extracted.articles.length === 0) {
    const err = new Error(
      "[EMPTY_RESULT] No articles could be extracted for list " + canonicalUrl
    );
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Final polite pause before returning.
  await page.waitForTimeout(Math.floor(Math.random() * 1500));

  const result = {
    list: extracted.list,
    articles: extracted.articles,
    count: extracted.articles.length,
  };
  if (extracted.partial) result.partial = true;
  return result;
};
