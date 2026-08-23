// Medium Topic Info — metadata, recommended publishers, and chronological archive.
// Reads the embedded Apollo Client cache from /tag/<slug> and its sub-pages.
// Uses small random delays, occasional mouse movement, and smooth scrolling to
// maintain a polite pacing profile.
export default async (page, params, cwd) => {
  // ----- Parameter validation -----
  const topic = (params.topic || "").trim().toLowerCase();
  if (!topic) {
    const err = new Error("[MISSING_PARAM] Required parameter 'topic' is missing or empty");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const section = (params.section || "info").trim().toLowerCase();
  const validSections = ["info", "who-to-follow", "archive"];
  if (!validSections.includes(section)) {
    const err = new Error(
      "[INVALID_PARAM] 'section' must be one of: " + validSections.join(", ")
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  let limit = 20;
  if (params.limit !== undefined && params.limit !== "") {
    const parsed = Number(params.limit);
    if (!Number.isInteger(parsed)) {
      const err = new Error("[INVALID_PARAM] 'limit' must be an integer between 1 and 100");
      err.code = "INVALID_PARAM";
      throw err;
    }
    limit = parsed;
  }
  if (limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] 'limit' must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // ----- Pacing helpers (Node side) -----
  const humanDelay = (min, max) =>
    page.waitForTimeout(min + Math.random() * (max - min));

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

  // ----- info section -----
  if (section === "info") {
    const infoUrl = "https://medium.com/tag/" + encodeURIComponent(topic);
    await page.goto(infoUrl, { waitUntil: "domcontentloaded" });
    await nudgeMouse();
    await humanDelay(200, 600);

    const info = await page.evaluate(({ topicSlug }) => {
      const cache = (() => {
        const client = window.__APOLLO_CLIENT__;
        return (
          (client && client.cache && client.cache.data && client.cache.data.data) ||
          window.__APOLLO_STATE__ ||
          null
        );
      })();
      if (!cache) return { __error: "APOLLO_CACHE_NOT_FOUND" };

      const tagKey = "Tag:" + topicSlug;
      const tag = cache[tagKey];
      if (!tag) {
        const bodyText = document.body.innerText || "";
        if (bodyText.includes("PAGE NOT FOUND") || bodyText.includes("404")) {
          return { __error: "NOT_FOUND" };
        }
        return { __error: "TAG_NOT_FOUND" };
      }

      // Gather related topics from the topic-nav bar.
      const relatedSet = new Set();
      const links = document.querySelectorAll('a[href^="/tag/"]');
      links.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const match = href.match(/^\/tag\/([^?]+)/);
        if (!match) return;
        const slug = match[1];
        if (
          slug === topicSlug ||
          slug.endsWith("/recommended") ||
          slug.endsWith("/who-to-follow") ||
          slug.endsWith("/archive")
        ) {
          return;
        }
        const name = a.textContent.trim();
        if (!name || /see more/i.test(name)) return;
        relatedSet.add(name);
      });

      const parentTag = tag.parentTag ? cache[tag.parentTag.__ref] : null;
      return {
        name: tag.displayTitle || tag.id || topicSlug,
        slug: tag.id || topicSlug,
        url: "https://medium.com/tag/" + (tag.normalizedTagSlug || tag.id || topicSlug),
        followersCount: typeof tag.followerCount === "number" ? tag.followerCount : null,
        postCount: typeof tag.postCount === "number" ? tag.postCount : null,
        parentTopic: parentTag
          ? { name: parentTag.displayTitle || parentTag.id, slug: parentTag.id }
          : null,
        relatedTopics: Array.from(relatedSet).slice(0, 30),
      };
    }, { topicSlug: topic });

    if (info && info.__error) {
      const err = new Error("[" + info.__error + "] Failed to load topic info for '" + topic + "'");
      err.code = info.__error;
      throw err;
    }

    await page.waitForTimeout(Math.floor(Math.random() * 500));
    return info;
  }

  // ----- who-to-follow section -----
  if (section === "who-to-follow") {
    const wtfUrl =
      "https://medium.com/tag/" + encodeURIComponent(topic) + "/who-to-follow";
    await page.goto(wtfUrl, { waitUntil: "domcontentloaded" });
    await nudgeMouse();
    await humanDelay(300, 700);

    const result = await page.evaluate(({ topicSlug, maxItems }) => {
      const cache = (() => {
        const client = window.__APOLLO_CLIENT__;
        return (
          (client && client.cache && client.cache.data && client.cache.data.data) ||
          window.__APOLLO_STATE__ ||
          null
        );
      })();
      if (!cache) return { __error: "APOLLO_CACHE_NOT_FOUND" };

      const bodyText = document.body.innerText || "";
      if (bodyText.includes("PAGE NOT FOUND") || bodyText.includes("404")) {
        return { __error: "NOT_FOUND" };
      }

      const root = cache["ROOT_QUERY"];
      if (!root) return { __error: "APOLLO_CACHE_NOT_FOUND" };

      const recKey = Object.keys(root).find((k) =>
        k.startsWith("recommendedPublishers(") && k.includes('"tagSlug":"' + topicSlug + '"')
      );
      if (!recKey) return { __error: "DRIFT_DETECTED" };

      const rec = root[recKey];
      if (!rec || !Array.isArray(rec.edges)) return { __error: "DRIFT_DETECTED" };

      // Build a DOM map of follower counts keyed by profile URL slug.
      const followerMap = {};
      document.querySelectorAll('a[href*="source=tag_who_to_follow_page---who_to_follow"]').forEach((a) => {
        const href = a.getAttribute("href") || "";
        const match = href.match(/^\/@([^?]+)/) || href.match(/^https:\/\/medium\.com\/([^?]+)/);
        if (!match) return;
        const slug = match[1];
        if (followerMap[slug]) return;
        let container = a.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!container) break;
          const text = container.textContent || "";
          if (/followers/i.test(text) || /Publication\s*·/i.test(text)) break;
          container = container.parentElement;
        }
        if (container) {
          const m = container.textContent.match(/([\d.]+[KMBkmb]?\s+followers)/i);
          if (m) followerMap[slug] = m[1];
        }
      });

      const items = [];
      const count = Math.min(rec.edges.length, maxItems);
      for (let i = 0; i < count; i++) {
        const edge = rec.edges[i];
        if (!edge || !edge.node || !edge.node.__ref) continue;
        const obj = cache[edge.node.__ref];
        if (!obj) continue;

        if (obj.__typename === "User") {
          const slug = obj.username || "";
          items.push({
            type: "user",
            name: obj.name || slug,
            slug: slug,
            bio: obj.bio || "",
            followersCount: followerMap[slug] || null,
            url: slug ? "https://medium.com/@" + slug : "",
          });
        } else if (obj.__typename === "Collection") {
          const slug = obj.slug || "";
          items.push({
            type: "publication",
            name: obj.name || slug,
            slug: slug,
            bio: obj.description || "",
            followersCount: followerMap[slug] || null,
            url: slug ? "https://medium.com/" + slug : "",
          });
        }
      }

      return { items, totalAvailable: rec.edges.length };
    }, { topicSlug: topic, maxItems: limit });

    if (result && result.__error) {
      const err = new Error(
        "[" + result.__error + "] Failed to load who-to-follow for '" + topic + "'"
      );
      err.code = result.__error;
      throw err;
    }

    if (!result.items || result.items.length === 0) {
      const err = new Error("[EMPTY_RESULT] No recommendations found for topic '" + topic + "'");
      err.code = "EMPTY_RESULT";
      throw err;
    }

    await page.waitForTimeout(Math.floor(Math.random() * 500));
    return {
      topic: topic,
      section: "who-to-follow",
      items: result.items,
      count: result.items.length,
      totalAvailable: result.totalAvailable,
    };
  }

  // ----- archive section -----
  if (section === "archive") {
    const archiveUrl =
      "https://medium.com/tag/" + encodeURIComponent(topic) + "/archive";
    await page.goto(archiveUrl, { waitUntil: "domcontentloaded" });
    await nudgeMouse();
    await humanDelay(300, 700);

    const extractArchive = async (maxItems) => {
      return page.evaluate(({ topicSlug, wanted }) => {
        const cache = (() => {
          const client = window.__APOLLO_CLIENT__;
          return (
            (client && client.cache && client.cache.data && client.cache.data.data) ||
            window.__APOLLO_STATE__ ||
            null
          );
        })();
        if (!cache) return { __error: "APOLLO_CACHE_NOT_FOUND" };

        const bodyText = document.body.innerText || "";
        if (bodyText.includes("PAGE NOT FOUND") || bodyText.includes("404")) {
          return { __error: "NOT_FOUND" };
        }

        const tagKey = "Tag:" + topicSlug;
        const tag = cache[tagKey];
        if (!tag) return { __error: "TAG_NOT_FOUND" };

        const postsKey = Object.keys(tag).find((k) =>
          k.startsWith("posts:") && k.includes('"sortOrder":"NEWEST"')
        );
        if (!postsKey) return { __error: "DRIFT_DETECTED" };

        const conn = tag[postsKey];
        if (!conn || !Array.isArray(conn.edges)) return { __error: "DRIFT_DETECTED" };

        const toIsoString = (ts) => {
          if (typeof ts === "number") {
            try {
              return new Date(ts).toISOString();
            } catch (_) {
              return String(ts);
            }
          }
          return "";
        };

        const buildPreviewImageUrl = (pImg) => {
          if (pImg && typeof pImg.id === "string") {
            return "https://miro.medium.com/v2/" + pImg.id;
          }
          return null;
        };

        const parsePublicationFromUrl = (url) => {
          if (!url) return null;
          try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            // Personal profiles: medium.com/@user or user.medium.com subdomain.
            if (host === "medium.com") {
              const pathParts = u.pathname.split("/").filter(Boolean);
              if (pathParts.length >= 1 && pathParts[0].startsWith("@")) {
                return null;
              }
            }
            if (host.endsWith(".medium.com")) {
              return null;
            }
            // Custom domain publication (e.g. example-publication.net).
            if (host !== "medium.com") {
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
        };

        const items = [];
        const count = Math.min(conn.edges.length, wanted);
        for (let i = 0; i < count; i++) {
          const edge = conn.edges[i];
          if (!edge || !edge.node || !edge.node.__ref) continue;
          const post = cache[edge.node.__ref];
          if (!post) continue;

          const creator = post.creator ? cache[post.creator.__ref] : null;
          const collection = post.collection ? cache[post.collection.__ref] : null;

          let subtitle = "";
          if (
            post.extendedPreviewContent &&
            typeof post.extendedPreviewContent.subtitle === "string"
          ) {
            subtitle = post.extendedPreviewContent.subtitle;
          } else if (
            post.extendedPreviewContent &&
            post.extendedPreviewContent.__ref
          ) {
            const epc = cache[post.extendedPreviewContent.__ref];
            if (epc && typeof epc.subtitle === "string") subtitle = epc.subtitle;
          }

          const readingTime =
            typeof post.readingTime === "number" ? Math.max(1, Math.round(post.readingTime)) : 0;

          items.push({
            title: post.title || "",
            subtitle: subtitle,
            url: post.mediumUrl || "",
            author: creator
              ? {
                  name: creator.name || creator.username || "Unknown",
                  username: creator.username || "",
                }
              : { name: "Unknown", username: "" },
            publication: collection
              ? {
                  name: collection.name || collection.slug,
                  slug: collection.slug || "",
                }
              : parsePublicationFromUrl(post.mediumUrl),
            publishedAt: toIsoString(post.firstPublishedAt),
            latestPublishedAt: toIsoString(post.latestPublishedAt),
            clapCount: typeof post.clapCount === "number" ? post.clapCount : 0,
            responseCount:
              post.postResponses && typeof post.postResponses.count === "number"
                ? post.postResponses.count
                : 0,
            readingTimeMinutes: readingTime,
            previewImageUrl: buildPreviewImageUrl(post.previewImage),
            isMemberOnly: post.isLocked === true || post.visibility === "LOCKED",
          });
        }

        return {
          items,
          feedItemCount: conn.edges.length,
          hasNextPage: !!(conn.pageInfo && conn.pageInfo.hasNextPage),
        };
      }, { topicSlug: topic, wanted: maxItems });
    };

    let status = await extractArchive(limit);
    if (status && status.__error) {
      const err = new Error(
        "[" + status.__error + "] Failed to load archive for '" + topic + "'"
      );
      err.code = status.__error;
      throw err;
    }

    let loadedItems = status.items;
    let feedItemCount = status.feedItemCount;
    let hasNextPage = status.hasNextPage;
    let scrollAttempts = 0;
    const maxScrollAttempts = 60;

    while (loadedItems.length < limit && hasNextPage && scrollAttempts < maxScrollAttempts) {
      const scrollDelta = 600 + Math.floor(Math.random() * 500);
      await page.evaluate((delta) => {
        window.scrollBy({ top: delta, behavior: "smooth" });
      }, scrollDelta);
      await humanDelay(800, 1600);

      if (Math.random() < 0.3) {
        await nudgeMouse();
      }

      const next = await extractArchive(limit);
      if (next && next.__error) {
        // Stream lost or blocked; return what we have.
        break;
      }

      if (next.feedItemCount > loadedItems.length) {
        loadedItems = next.items;
        feedItemCount = next.feedItemCount;
      }
      hasNextPage = next.hasNextPage;
      scrollAttempts++;
    }

    if (!loadedItems || loadedItems.length === 0) {
      const err = new Error("[EMPTY_RESULT] No archive articles found for topic '" + topic + "'");
      err.code = "EMPTY_RESULT";
      throw err;
    }

    await page.waitForTimeout(Math.floor(Math.random() * 500));
    return {
      topic: topic,
      section: "archive",
      articles: loadedItems,
      count: loadedItems.length,
      requestedLimit: limit,
      partial: loadedItems.length < limit,
    };
  }

  // Unreachable because of the earlier validation, but kept for safety.
  const err = new Error("[INVALID_PARAM] Unsupported section: " + section);
  err.code = "INVALID_PARAM";
  throw err;
};
