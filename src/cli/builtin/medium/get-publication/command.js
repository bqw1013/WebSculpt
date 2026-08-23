// medium/get-publication
// Fetch a Medium publication's metadata and one article section by slug.
//
// Data source: Medium's own GraphQL endpoint `POST <origin>/_/graphql`, called
// from the publication page's context. This is the same endpoint the site uses
// when a visitor scrolls the /<slug>/all stream; the server accepts ad-hoc
// queries (verified 2026-08-06, see evidence.md).
//   - section=home: curated homepage selection. Order comes from the page's
//     window.__APOLLO_STATE__ PublicationPostsSection nodes (the DOM only
//     renders the first ~20 cards), then each post is enriched in batch via
//     `post(id:)` for full metadata.
//   - section=all: full chronological stream via `PublicationContentDataQuery`
//     (publicationPostsConnection, orderBy publishedAt DESC), paginated with
//     its cursor until `limit` is reached or the stream is exhausted.
//
// Polite pacing: random short waits, a small mouse move and a gentle
// scroll after page load, plus small randomized delays between API pages —
// kept light so the command stays fast.

// GraphQL: publication metadata. Verified to return null for unknown slugs.
const PUB_META_QUERY =
  "query PubMeta($ref: PublicationRef!) {\n" +
  "  publication: publicationByRef(ref: $ref) {\n" +
  "    id name slug tagline description domain\n" +
  "    followGraph { followerCount }\n" +
  "    avatar { id }\n" +
  "    navigationItems { title value destination }\n" +
  "  }\n" +
  "}";

// GraphQL: chronological stream page (the site's own PublicationContentDataQuery shape).
const STREAM_QUERY =
  "query PublicationContentDataQuery($ref: PublicationRef!, $first: Int!, $after: String!, $orderBy: PublicationPostsOrderBy, $filter: PublicationPostsFilter) {\n" +
  "  publication: publicationByRef(ref: $ref) {\n" +
  "    publicationPostsConnection(first: $first, after: $after, orderBy: $orderBy, filter: $filter) {\n" +
  "      edges {\n" +
  "        listedAt\n" +
  "        node { id title mediumUrl readingTime firstPublishedAt latestPublishedAt isLocked clapCount postResponses { count } previewImage { id } extendedPreviewContent { subtitle } creator { id username name imageId } }\n" +
  "      }\n" +
  "      pageInfo { endCursor hasNextPage }\n" +
  "    }\n" +
  "  }\n" +
  "}";

// GraphQL: single post enrichment (batched, one operation per id per request chunk).
const POST_QUERY =
  "query PostMeta($id: ID!) {\n" +
  "  post(id: $id) {\n" +
  "    id title mediumUrl readingTime firstPublishedAt latestPublishedAt isLocked clapCount\n" +
  "    postResponses { count }\n" +
  "    previewImage { id }\n" +
  "    extendedPreviewContent { subtitle }\n" +
  "    creator { username name imageId }\n" +
  "    tags { id displayTitle }\n" +
  "  }\n" +
  "}";

// Helper functions can be defined above export default
export default async (page, params, cwd) => {

  // ---------- Parameter validation (before any page access) ----------

  const slug = (params.slug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    const err = new Error("[MISSING_PARAM] --slug is required. It is the first path segment of the publication URL https://medium.com/<slug>, e.g. grepsr-blog, ux-planet.");
    err.code = "MISSING_PARAM";
    throw err;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(slug)) {
    const err = new Error("[INVALID_PARAM] --slug must contain only letters, digits and hyphens (no '@', '/' or URL). Got: " + slug);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const section = params.section; // manifest default: "home"
  if (section !== "home" && section !== "all") {
    const err = new Error("[INVALID_PARAM] --section must be one of: home (curated homepage selection) | all (full chronological stream). Got: " + section);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const limit = parseInt(params.limit, 10); // manifest default: "20"
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] --limit must be an integer between 1 and 100. Got: " + params.limit);
    err.code = "INVALID_PARAM";
    throw err;
  }

  // ---------- Load the publication page (follows custom-domain redirects) ----------

  await page.goto("https://medium.com/" + slug, { waitUntil: "domcontentloaded" });

  // Fail fast on Medium's 404 page before waiting for anything else.
  await page.waitForTimeout(500 + Math.random() * 500);
  const is404 = await page.evaluate(() =>
    /PAGE NOT FOUND/i.test(document.body ? document.body.innerText : "")
  );
  if (is404) {
    const err = new Error("[NOT_FOUND] No Medium publication found for slug '" + slug + "' (Medium returned its 404 page). Check the slug in the publication URL https://medium.com/<slug>.");
    err.code = "NOT_FOUND";
    throw err;
  }

  // Light polite behavior: short pause, small mouse move, gentle scroll.
  await page.mouse.move(
    100 + Math.floor(Math.random() * 300),
    150 + Math.floor(Math.random() * 250)
  );
  await page.waitForTimeout(200 + Math.random() * 400);
  await page.evaluate(() => {
    window.scrollTo({
      top: Math.floor(window.innerHeight * (0.2 + Math.random() * 0.2)),
      behavior: "smooth",
    });
  });
  await page.waitForTimeout(400 + Math.random() * 600);

  // For section=home the curated ordering lives in the Apollo state; wait for it.
  if (section === "home") {
    try {
      await page.waitForFunction(
        () => window.__APOLLO_STATE__ && window.__APOLLO_STATE__.ROOT_QUERY,
        { timeout: 15000 }
      );
    } catch {
      const err = new Error("[PAGE_LOAD_FAILED] Page did not hydrate its Apollo state within 15s.");
      err.code = "PAGE_LOAD_FAILED";
      throw err;
    }
  }

  // ---------- Extraction (runs in the page context; fetch hits <origin>/_/graphql) ----------

  const extracted = await page.evaluate(
    async ({ slug, section, limit, PUB_META_QUERY, STREAM_QUERY, POST_QUERY }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // One GraphQL POST; body is an array of operations (Medium's wire format).
      async function gql(operations) {
        const res = await fetch("/_/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(operations),
        });
        if (!res.ok) return { __error: "API_REQUEST_FAILED", status: res.status };
        return res.json();
      }

      // -- 1. Publication metadata (also the NOT_FOUND check) --
      const metaRes = await gql([
        {
          operationName: "PubMeta",
          variables: { ref: { slug, domain: null } },
          query: PUB_META_QUERY,
        },
      ]);
      if (metaRes.__error) return metaRes;
      const metaPayload = metaRes[0];
      if (metaPayload && metaPayload.errors) {
        return { __error: "DRIFT_DETECTED", detail: JSON.stringify(metaPayload.errors).slice(0, 300) };
      }
      const pub = metaPayload && metaPayload.data && metaPayload.data.publication;
      if (!pub) return { __error: "NOT_FOUND" };

      const miro = (imageId, size) =>
        imageId ? "https://miro.medium.com/v2/resize:fit:" + size + "/" + imageId : null;

      const publication = {
        id: pub.id,
        name: pub.name || "",
        slug: pub.slug || slug,
        url: pub.domain ? "https://" + pub.domain : "https://medium.com/" + (pub.slug || slug),
        domain: pub.domain || "",
        tagline: pub.tagline || "",
        description: pub.description || pub.tagline || "",
        followersCount:
          pub.followGraph && typeof pub.followGraph.followerCount === "number"
            ? pub.followGraph.followerCount
            : 0,
        avatarUrl: pub.avatar ? miro(pub.avatar.id, 140) : null,
        navigationItems: Array.isArray(pub.navigationItems)
          ? pub.navigationItems.map((n) => ({
              title: n.title || "",
              value: n.value || "",
              destination: n.destination || "",
            }))
          : [],
      };

      function mapPost(node, extra) {
        const creator = node.creator || {};
        const article = {
          id: node.id || "",
          title: node.title || "",
          subtitle:
            (node.extendedPreviewContent && node.extendedPreviewContent.subtitle) || "",
          url: node.mediumUrl || "",
          author: {
            name: creator.name || "",
            username: creator.username || "",
            profileUrl: creator.username ? "https://medium.com/@" + creator.username : "",
            avatarUrl: miro(creator.imageId, 64),
          },
          publishedAt:
            typeof node.firstPublishedAt === "number"
              ? new Date(node.firstPublishedAt).toISOString()
              : "",
          updatedAt:
            typeof node.latestPublishedAt === "number"
              ? new Date(node.latestPublishedAt).toISOString()
              : "",
          clapCount: typeof node.clapCount === "number" ? node.clapCount : 0,
          responseCount:
            node.postResponses && typeof node.postResponses.count === "number"
              ? node.postResponses.count
              : 0,
          readingTimeMinutes:
            typeof node.readingTime === "number" ? Math.round(node.readingTime) : 0,
          previewImageUrl: node.previewImage ? miro(node.previewImage.id, 400) : null,
          isMemberOnly: node.isLocked === true,
        };
        if (extra) Object.assign(article, extra);
        return article;
      }

      // -- 2a. section=all: paginate the chronological stream --
      if (section === "all") {
        const articles = [];
        let after = "";
        let exhausted = false;
        while (articles.length < limit && !exhausted) {
          const remaining = limit - articles.length;
          // Server may return slightly fewer edges than requested (verified),
          // so request a bit more and loop on hasNextPage.
          const res = await gql([
            {
              operationName: "PublicationContentDataQuery",
              variables: {
                ref: { slug, domain: null },
                first: Math.min(remaining + 5, 100),
                after,
                orderBy: { publishedAt: "DESC" },
                filter: { published: true },
              },
              query: STREAM_QUERY,
            },
          ]);
          if (res.__error) return res;
          const payload = res[0];
          if (payload && payload.errors) {
            return { __error: "DRIFT_DETECTED", detail: JSON.stringify(payload.errors).slice(0, 300) };
          }
          const conn =
            payload &&
            payload.data &&
            payload.data.publication &&
            payload.data.publication.publicationPostsConnection;
          if (!conn) {
            return { __error: "DRIFT_DETECTED", detail: "publicationPostsConnection missing in response" };
          }
          for (const edge of conn.edges || []) {
            if (edge && edge.node) articles.push(mapPost(edge.node));
            if (articles.length >= limit) break;
          }
          if (conn.pageInfo && conn.pageInfo.hasNextPage && conn.pageInfo.endCursor) {
            after = conn.pageInfo.endCursor;
            await sleep(200 + Math.random() * 400); // gentle pacing between pages
          } else {
            exhausted = true;
          }
        }
        return { publication, articles, partial: exhausted && articles.length < limit };
      }

      // -- 2b. section=home: curated order from Apollo sections + batch enrichment --
      const state = window.__APOLLO_STATE__;
      if (!state) return { __error: "APOLLO_STATE_NOT_FOUND" };
      const homePage = state["PublicationPage:homepage"];
      const sectionRefs = homePage && Array.isArray(homePage.sections) ? homePage.sections : [];
      const ordered = []; // [{ id, section }]
      const seen = new Set();
      for (const ref of sectionRefs) {
        const sec = ref && ref.__ref ? state[ref.__ref] : null;
        if (!sec || !Array.isArray(sec.posts)) continue;
        const secTitle = sec.title || "";
        for (const postRef of sec.posts) {
          const postId = postRef && postRef.__ref ? postRef.__ref.replace(/^Post:/, "") : null;
          if (!postId || seen.has(postId)) continue;
          seen.add(postId);
          ordered.push({ id: postId, section: secTitle });
          if (ordered.length >= limit) break;
        }
        if (ordered.length >= limit) break;
      }
      if (ordered.length === 0) return { __error: "EMPTY_RESULT" };

      // Enrich in chunks of 25 ids per POST (array body = one request per chunk).
      const byId = {};
      for (let i = 0; i < ordered.length; i += 25) {
        const chunk = ordered.slice(i, i + 25);
        const res = await gql(
          chunk.map((item) => ({
            operationName: "PostMeta",
            variables: { id: item.id },
            query: POST_QUERY,
          }))
        );
        if (res.__error) return res;
        if (!Array.isArray(res) || (res[0] && res[0].errors)) {
          return { __error: "DRIFT_DETECTED", detail: JSON.stringify(res).slice(0, 300) };
        }
        res.forEach((payload, j) => {
          const post = payload && payload.data && payload.data.post;
          if (post) byId[chunk[j].id] = post;
        });
        if (i + 25 < ordered.length) await sleep(200 + Math.random() * 400);
      }

      const articles = [];
      for (const item of ordered) {
        const post = byId[item.id];
        if (!post) continue; // post deleted/unpublished since homepage render
        const tags = Array.isArray(post.tags)
          ? post.tags.map((t) => t.displayTitle || t.id || "").filter(Boolean)
          : [];
        articles.push(mapPost(post, { tags, section: item.section }));
      }
      return {
        publication,
        articles,
        partial: ordered.length < limit || articles.length < ordered.length,
      };
    },
    { slug, section, limit, PUB_META_QUERY, STREAM_QUERY, POST_QUERY }
  );

  // ---------- Error mapping ----------

  if (extracted && extracted.__error) {
    const code = extracted.__error;
    const messages = {
      NOT_FOUND:
        "[NOT_FOUND] No Medium publication found for slug '" + slug + "'. " +
        "The slug is the first path segment of https://medium.com/<slug>. " +
        "Note: publications that moved off Medium to their own site (e.g. towards-data-science) no longer resolve here.",
      API_REQUEST_FAILED:
        "[API_REQUEST_FAILED] Medium GraphQL endpoint returned HTTP " + (extracted.status || "?") + ". Retry later or reduce request frequency.",
      DRIFT_DETECTED:
        "[DRIFT_DETECTED] Medium GraphQL schema/response changed. " + (extracted.detail || ""),
      APOLLO_STATE_NOT_FOUND:
        "[DRIFT_DETECTED] window.__APOLLO_STATE__ not found; Medium's page structure changed.",
      EMPTY_RESULT:
        "[EMPTY_RESULT] The publication homepage contains no curated posts.",
    };
    const err = new Error(messages[code] || "[" + code + "] Extraction failed");
    err.code = code;
    throw err;
  }

  if (!extracted.articles || extracted.articles.length === 0) {
    const err = new Error("[EMPTY_RESULT] No articles could be extracted for publication '" + slug + "' (section=" + section + ").");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Final polite pause before finishing.
  await page.waitForTimeout(300 + Math.random() * 700);

  const result = {
    publication: extracted.publication,
    section,
    count: extracted.articles.length,
    articles: extracted.articles,
  };
  if (extracted.partial) result.partial = true;
  return result;
};
