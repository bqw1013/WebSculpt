// Medium Topic Trending — popular articles for a Medium topic.
// Reads the lazy-loading recommended stream at /tag/<slug>/recommended from the
// live Apollo Client cache, which is updated as the page scrolls. Includes
// random delays, mouse movement and smooth scrolling to maintain a polite pacing profile.
export default async (page, params, cwd) => {
  // ----- Parameter validation -----
  const topic = (params.topic || "").trim().toLowerCase();
  if (!topic) {
    const err = new Error("[MISSING_PARAM] Required parameter 'topic' is missing or empty");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const limit = parseInt(params.limit, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] 'limit' must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // ----- Pacing helpers -----
  // Lightweight random wait that does not dominate runtime.
  const humanDelay = (min, max) => page.waitForTimeout(min + Math.random() * (max - min));

  // Move mouse to a random spot inside the viewport, occasionally.
  const nudgeMouse = async () => {
    try {
      const viewport = await page.evaluate(() => ({
        w: window.innerWidth,
        h: window.innerHeight,
      }));
      if (viewport.w > 0 && viewport.h > 0) {
        const x = Math.floor(Math.random() * Math.max(1, viewport.w - 20));
        const y = Math.floor(Math.random() * Math.max(1, viewport.h - 20));
        await page.mouse.move(Math.max(0, x), Math.max(0, y));
      }
    } catch (_) {
      // Ignore harmless interaction errors.
    }
  };

  // ----- Navigate to the recommended stream -----
  const topicUrl = "https://medium.com/tag/" + encodeURIComponent(topic) + "/recommended";
  await page.goto(topicUrl, { waitUntil: "domcontentloaded" });

  // Initial light pause.
  await nudgeMouse();
  await humanDelay(200, 600);

  // ----- Wait for Apollo cache hydration -----
  try {
    await page.waitForFunction(
      () => {
        const client = window.__APOLLO_CLIENT__;
        const cache = client && client.cache && client.cache.data && client.cache.data.data;
        if (!cache || !cache.ROOT_QUERY) return false;
        const postKeys = Object.keys(cache).filter((k) => k.startsWith("Post:"));
        return postKeys.length >= 5;
      },
      { timeout: 20000 }
    );
  } catch {
    // Distinguish a missing topic from a genuine hydration timeout.
    const tagCheck = await page.evaluate(({ topicSlug }) => {
      const client = window.__APOLLO_CLIENT__;
      const cache = client && client.cache && client.cache.data && client.cache.data.data;
      if (!cache || !cache.ROOT_QUERY) return { rootMissing: true };
      const tagRef = cache.ROOT_QUERY['tagFromSlug({"tagSlug":"' + topicSlug + '"})'];
      if (tagRef === null) return { tagMissing: true };
      return { tagMissing: false };
    }, { topicSlug: topic });

    if (tagCheck && tagCheck.tagMissing) {
      const err = new Error("[TAG_NOT_FOUND] The requested topic does not exist: '" + topic + "'");
      err.code = "TAG_NOT_FOUND";
      throw err;
    }

    const err = new Error("[PAGE_LOAD_FAILED] Apollo cache did not hydrate within timeout");
    err.code = "PAGE_LOAD_FAILED";
    throw err;
  }

  // ----- Extract data from the live Apollo cache -----
  const extractResult = await page.evaluate(({ topicSlug, maxItems }) => {
    const client = window.__APOLLO_CLIENT__;
    const cache = client && client.cache && client.cache.data && client.cache.data.data;
    if (!cache) return { __error: "APOLLO_CACHE_NOT_FOUND" };

    const rootQuery = cache["ROOT_QUERY"];
    if (!rootQuery) return { __error: "APOLLO_CACHE_NOT_FOUND" };

    // Locate tag data via ROOT_QUERY.
    const tagQueryKey = 'tagFromSlug({"tagSlug":"' + topicSlug + '"})';
    const tagRef = rootQuery[tagQueryKey];
    if (!tagRef) return { __error: "TAG_NOT_FOUND" };
    if (!tagRef.__ref) return { __error: "TAG_NOT_FOUND" };

    const tagData = cache[tagRef.__ref];
    if (!tagData) return { __error: "TAG_DATA_NOT_FOUND" };

    // Locate viewerEdge and recommended feed.
    if (!tagData.viewerEdge || !tagData.viewerEdge.__ref) {
      return { __error: "DRIFT_DETECTED" };
    }
    const viewerEdge = cache[tagData.viewerEdge.__ref];
    if (!viewerEdge) return { __error: "DRIFT_DETECTED" };

    const feedKey = Object.keys(viewerEdge).find((k) => k.startsWith("recommendedPostsFeed"));
    if (!feedKey) return { __error: "DRIFT_DETECTED" };
    const feed = viewerEdge[feedKey];
    if (!feed || !Array.isArray(feed.items)) return { __error: "DRIFT_DETECTED" };

    // ----- Shared helpers -----
    function resolveTags(tagRefs) {
      const result = [];
      if (Array.isArray(tagRefs)) {
        for (let i = 0; i < tagRefs.length; i++) {
          const tRef = tagRefs[i];
          if (tRef && tRef.__ref) {
            const tagObj = cache[tRef.__ref];
            if (tagObj) {
              result.push(tagObj.displayTitle || tagObj.id || "");
            }
          }
        }
      }
      return result;
    }

    function resolveCreator(creatorRef) {
      if (creatorRef && creatorRef.__ref) {
        const c = cache[creatorRef.__ref];
        if (c) {
          return {
            name: c.name || "Unknown",
            username: c.username || "",
            url: c.username ? "https://medium.com/@" + c.username : "",
          };
        }
      }
      return { name: "Unknown", username: "", url: "" };
    }

    function buildPreviewImage(pImg) {
      if (pImg && typeof pImg.id === "string") {
        return "https://miro.medium.com/v2/" + pImg.id;
      }
      return null;
    }

    function parsePublicationFromUrl(url) {
      if (!url) return null;
      try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        // Personal articles are on medium.com/@<user>.
        if (host === "medium.com" || host.endsWith(".medium.com")) {
          const pathParts = u.pathname.split("/").filter(Boolean);
          if (pathParts.length >= 1 && pathParts[0].startsWith("@")) {
            return null;
          }
        }
        // Publication custom domain (e.g. example-publication.net).
        if (host !== "medium.com" && !host.endsWith(".medium.com")) {
          return {
            name: host.replace(/^www\./, ""),
            slug: host.replace(/^www\./, ""),
            url: u.protocol + "//" + host,
          };
        }
        // Medium-hosted publication: /<slug>/<article>.
        const pathParts = u.pathname.split("/").filter(Boolean);
        if (pathParts.length >= 1 && !pathParts[0].startsWith("@")) {
          const slug = pathParts[0];
          return {
            name: slug,
            slug: slug,
            url: "https://medium.com/" + slug,
          };
        }
      } catch (_) {
        // fall through
      }
      return null;
    }

    function toIsoString(ts) {
      if (typeof ts === "number") {
        try {
          return new Date(ts).toISOString();
        } catch (_) {
          return String(ts);
        }
      }
      return "";
    }

    // ----- Build items -----
    const items = [];
    const count = Math.min(feed.items.length, maxItems);
    for (let i = 0; i < count; i++) {
      const feedItem = feed.items[i];
      if (!feedItem || !feedItem.post || !feedItem.post.__ref) continue;

      const apolloPost = cache[feedItem.post.__ref];
      if (!apolloPost) continue;

      const author = resolveCreator(apolloPost.creator);
      const tags = resolveTags(apolloPost.tags);
      const previewImage = buildPreviewImage(apolloPost.previewImage);
      const publication = parsePublicationFromUrl(apolloPost.mediumUrl);

      let subtitle = "";
      if (
        apolloPost.extendedPreviewContent &&
        typeof apolloPost.extendedPreviewContent.subtitle === "string"
      ) {
        subtitle = apolloPost.extendedPreviewContent.subtitle;
      } else if (
        apolloPost.extendedPreviewContent &&
        apolloPost.extendedPreviewContent.__ref
      ) {
        const epc = cache[apolloPost.extendedPreviewContent.__ref];
        if (epc && typeof epc.subtitle === "string") {
          subtitle = epc.subtitle;
        }
      }

      const readingTime =
        typeof apolloPost.readingTime === "number"
          ? Math.max(1, Math.round(apolloPost.readingTime))
          : 0;

      items.push({
        rank: items.length + 1,
        title: apolloPost.title || "",
        subtitle: subtitle,
        url: apolloPost.mediumUrl || "",
        author: author,
        publication: publication,
        clapCount:
          typeof apolloPost.clapCount === "number" ? apolloPost.clapCount : 0,
        responseCount:
          apolloPost.postResponses &&
          typeof apolloPost.postResponses.count === "number"
            ? apolloPost.postResponses.count
            : 0,
        readingTimeMinutes: readingTime,
        publishedAt: toIsoString(apolloPost.firstPublishedAt),
        latestPublishedAt: toIsoString(apolloPost.latestPublishedAt),
        tags: tags,
        previewImage: previewImage,
        isLocked: apolloPost.isLocked === true,
        isMemberOnly: apolloPost.isLocked === true,
      });
    }

    return {
      items: items,
      topic: {
        slug: tagData.id || topicSlug,
        displayTitle: tagData.displayTitle || topicSlug,
      },
      feedItemCount: feed.items.length,
      hasNextPage: !!(feed.pagingInfo && feed.pagingInfo.next),
    };
  }, { topicSlug: topic, maxItems: limit });

  if (extractResult && extractResult.__error) {
    const code = extractResult.__error;
    const err = new Error("[" + code + "] Failed to extract topic trending data for '" + topic + "'");
    err.code = code;
    throw err;
  }

  // ----- Scroll to load more items if needed -----
  let loadedItems = extractResult.items;
  let feedItemCount = extractResult.feedItemCount;
  let hasNextPage = extractResult.hasNextPage;
  let scrollAttempts = 0;
  const maxScrollAttempts = 60;

  while (loadedItems.length < limit && hasNextPage && scrollAttempts < maxScrollAttempts) {
    // Random small scroll + wait.
    const scrollDelta = 600 + Math.floor(Math.random() * 500);
    await page.evaluate((delta) => {
      window.scrollBy({ top: delta, behavior: "smooth" });
    }, scrollDelta);
    await humanDelay(600, 1400);

    // Occasionally move the mouse.
    if (Math.random() < 0.3) {
      await nudgeMouse();
    }

    const status = await page.evaluate(({ topicSlug }) => {
      const client = window.__APOLLO_CLIENT__;
      const cache = client && client.cache && client.cache.data && client.cache.data.data;
      if (!cache) return { error: "APOLLO_CACHE_NOT_FOUND" };
      const rootQuery = cache["ROOT_QUERY"];
      const tagRef = rootQuery['tagFromSlug({"tagSlug":"' + topicSlug + '"})'];
      if (!tagRef || !tagRef.__ref) return { error: "TAG_NOT_FOUND" };
      const tagData = cache[tagRef.__ref];
      const ve = cache[tagData.viewerEdge.__ref];
      const feedKey = Object.keys(ve).find((k) => k.startsWith("recommendedPostsFeed"));
      const feed = ve[feedKey];
      return {
        feedItemCount: feed.items.length,
        hasNextPage: !!(feed.pagingInfo && feed.pagingInfo.next),
      };
    }, { topicSlug: topic });

    if (status.error) {
      const err = new Error("[" + status.error + "] Feed state lost while scrolling for '" + topic + "'");
      err.code = status.error;
      throw err;
    }

    feedItemCount = status.feedItemCount;
    hasNextPage = status.hasNextPage;
    scrollAttempts++;

    // Re-extract up to limit.
    if (feedItemCount > loadedItems.length) {
      const more = await page.evaluate(({ topicSlug, maxItems }) => {
        const client = window.__APOLLO_CLIENT__;
        const cache = client && client.cache && client.cache.data && client.cache.data.data;
        const rootQuery = cache["ROOT_QUERY"];
        const tagRef = rootQuery['tagFromSlug({"tagSlug":"' + topicSlug + '"})'];
        const tagData = cache[tagRef.__ref];
        const ve = cache[tagData.viewerEdge.__ref];
        const feedKey = Object.keys(ve).find((k) => k.startsWith("recommendedPostsFeed"));
        const feed = ve[feedKey];

        function resolveTags(tagRefs) {
          const result = [];
          if (Array.isArray(tagRefs)) {
            for (let i = 0; i < tagRefs.length; i++) {
              const tRef = tagRefs[i];
              if (tRef && tRef.__ref) {
                const tagObj = cache[tRef.__ref];
                if (tagObj) result.push(tagObj.displayTitle || tagObj.id || "");
              }
            }
          }
          return result;
        }

        function resolveCreator(creatorRef) {
          if (creatorRef && creatorRef.__ref) {
            const c = cache[creatorRef.__ref];
            if (c) {
              return {
                name: c.name || "Unknown",
                username: c.username || "",
                url: c.username ? "https://medium.com/@" + c.username : "",
              };
            }
          }
          return { name: "Unknown", username: "", url: "" };
        }

        function parsePublicationFromUrl(url) {
          if (!url) return null;
          try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            if (host === "medium.com" || host.endsWith(".medium.com")) {
              const pathParts = u.pathname.split("/").filter(Boolean);
              if (pathParts.length >= 1 && pathParts[0].startsWith("@")) return null;
            }
            if (host !== "medium.com" && !host.endsWith(".medium.com")) {
              return {
                name: host.replace(/^www\./, ""),
                slug: host.replace(/^www\./, ""),
                url: u.protocol + "//" + host,
              };
            }
            const pathParts = u.pathname.split("/").filter(Boolean);
            if (pathParts.length >= 1 && !pathParts[0].startsWith("@")) {
              const slug = pathParts[0];
              return { name: slug, slug: slug, url: "https://medium.com/" + slug };
            }
          } catch (_) {}
          return null;
        }

        function toIsoString(ts) {
          if (typeof ts === "number") {
            try {
              return new Date(ts).toISOString();
            } catch (_) {
              return String(ts);
            }
          }
          return "";
        }

        const items = [];
        const count = Math.min(feed.items.length, maxItems);
        for (let i = 0; i < count; i++) {
          const feedItem = feed.items[i];
          if (!feedItem || !feedItem.post || !feedItem.post.__ref) continue;
          const apolloPost = cache[feedItem.post.__ref];
          if (!apolloPost) continue;

          let subtitle = "";
          if (
            apolloPost.extendedPreviewContent &&
            typeof apolloPost.extendedPreviewContent.subtitle === "string"
          ) {
            subtitle = apolloPost.extendedPreviewContent.subtitle;
          } else if (
            apolloPost.extendedPreviewContent &&
            apolloPost.extendedPreviewContent.__ref
          ) {
            const epc = cache[apolloPost.extendedPreviewContent.__ref];
            if (epc && typeof epc.subtitle === "string") subtitle = epc.subtitle;
          }

          items.push({
            rank: items.length + 1,
            title: apolloPost.title || "",
            subtitle: subtitle,
            url: apolloPost.mediumUrl || "",
            author: resolveCreator(apolloPost.creator),
            publication: parsePublicationFromUrl(apolloPost.mediumUrl),
            clapCount: typeof apolloPost.clapCount === "number" ? apolloPost.clapCount : 0,
            responseCount:
              apolloPost.postResponses && typeof apolloPost.postResponses.count === "number"
                ? apolloPost.postResponses.count
                : 0,
            readingTimeMinutes:
              typeof apolloPost.readingTime === "number"
                ? Math.max(1, Math.round(apolloPost.readingTime))
                : 0,
            publishedAt: toIsoString(apolloPost.firstPublishedAt),
            latestPublishedAt: toIsoString(apolloPost.latestPublishedAt),
            tags: resolveTags(apolloPost.tags),
            previewImage:
              apolloPost.previewImage && typeof apolloPost.previewImage.id === "string"
                ? "https://miro.medium.com/v2/" + apolloPost.previewImage.id
                : null,
            isLocked: apolloPost.isLocked === true,
            isMemberOnly: apolloPost.isLocked === true,
          });
        }
        return { items, feedItemCount: feed.items.length, hasNextPage: !!(feed.pagingInfo && feed.pagingInfo.next) };
      }, { topicSlug: topic, maxItems: limit });

      loadedItems = more.items;
      feedItemCount = more.feedItemCount;
      hasNextPage = more.hasNextPage;
    }
  }

  if (!loadedItems || loadedItems.length === 0) {
    const err = new Error("[EMPTY_RESULT] No articles found for topic '" + topic + "'");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Final light pause before returning.
  await page.waitForTimeout(Math.floor(Math.random() * 800));

  return {
    topic: extractResult.topic,
    items: loadedItems,
    count: loadedItems.length,
    requestedLimit: limit,
    partial: loadedItems.length < limit,
  };
};
