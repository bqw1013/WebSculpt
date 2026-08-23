const MAX_LIMIT = 100;
const TYPES = new Set(["posts", "people", "publications", "topics", "lists"]);
const SORTS = new Set(["default", "latest", "popular"]);
const TIMES = new Set(["all", "day", "week", "month", "year"]);

const POST_QUERY = `query SearchPosts($query: String!, $pagingOptions: SearchPagingOptions!) {
  search(query: $query) {
    __typename
    ... on Search {
      posts(pagingOptions: $pagingOptions) {
        __typename
        ... on SearchPost {
          pagingInfo { next { limit page __typename } __typename }
          items {
            id algoliaObjectId title mediumUrl uniqueSlug visibility isPublished isLocked
            firstPublishedAt latestPublishedAt pinnedAt readingTime clapCount
            postResponses { count __typename }
            creator { id name username imageId bio __typename }
            collection { id name description shortDescription domain slug __typename }
            previewImage { id alt focusPercentX focusPercentY __typename }
            extendedPreviewContent { subtitle isFullContent __typename }
            tags { id displayTitle normalizedTagSlug __typename }
            __typename
          }
          queryId
        }
      }
    }
  }
}`;

const ENTITY_QUERY = `query SearchEntities($query: String!, $pagingOptions: SearchPagingOptions!) {
  search(query: $query) {
    __typename
    ... on Search {
      people(pagingOptions: $pagingOptions) {
        __typename
        ... on SearchPeople {
          pagingInfo { next { limit page __typename } __typename }
          items { __typename ... on User { id name username bio imageId customDomainState { live { domain __typename } __typename } __typename } }
          queryId
        }
      }
      collections(pagingOptions: $pagingOptions) {
        __typename
        ... on SearchCollection {
          pagingInfo { next { limit page __typename } __typename }
          items { id name description shortDescription domain slug avatar { id __typename } __typename }
          queryId
        }
      }
      tags(pagingOptions: $pagingOptions) {
        __typename
        ... on SearchTag {
          pagingInfo { next { limit page __typename } __typename }
          items { id displayTitle normalizedTagSlug __typename }
          queryId
        }
      }
      catalogs(pagingOptions: $pagingOptions) {
        __typename
        ... on SearchCatalog {
          pagingInfo { next { limit page __typename } __typename }
          items { id name description type predefined postItemsCount creator { id name username __typename } __typename }
          queryId
        }
      }
    }
  }
}`;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function lightHumanize(page, scroll = false) {
  try {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (page.mouse && viewport.width > 0 && viewport.height > 0) {
      await page.mouse.move(
        Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
        Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
        { steps: randomBetween(2, 4) }
      );
      if (scroll && typeof page.mouse.wheel === "function") await page.mouse.wheel(0, randomBetween(80, 180));
    }
  } catch {
    // Pointer and scroll nudges are best effort.
  }
}

function searchUrl(query, type) {
  const path = { posts: "posts", people: "users", publications: "publications", topics: "tags", lists: "lists" }[type];
  return `https://medium.com/search/${path}?q=${encodeURIComponent(query)}`;
}

function sectionFor(type) {
  return { posts: "posts", people: "people", publications: "collections", topics: "tags", lists: "catalogs" }[type];
}

function selectorFor(type) {
  return {
    posts: 'article[data-testid="post-preview"]',
    people: '[data-testid="search-user-preview"]',
    publications: '[data-testid="search-pub-preview"]',
    topics: "main h1",
    lists: "main h1"
  }[type];
}

function resultKey(item, type) {
  return item?.id || `${type}:${item?.mediumUrl || item?.name || item?.title || JSON.stringify(item)}`;
}

function nativePage(body, type) {
  if (!body || typeof body !== "object" || !body.data || !body.data.search) throw new Error("GraphQL schema missing search");
  if (Array.isArray(body.errors) && body.errors.length) throw new Error(body.errors.map((item) => item.message || "GraphQL error").join("; "));
  const section = body.data.search[sectionFor(type)];
  if (!section || !Array.isArray(section.items)) throw new Error(`GraphQL schema missing ${sectionFor(type)} items`);
  const next = section.pagingInfo?.next;
  return { items: section.items, nextPage: Number.isInteger(next?.page) ? next.page : null };
}

async function readGraphql(page, query, variables) {
  const response = await page.evaluate(async (payload) => {
    const result = await fetch("/_/graphql", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { status: result.status, body: await result.text() };
  }, { operationName: query === POST_QUERY ? "SearchPosts" : "SearchEntities", variables, query });
  if (response.status < 200 || response.status >= 300) throw new Error(`GraphQL HTTP ${response.status}`);
  let body;
  try { body = JSON.parse(response.body); } catch { throw new Error("invalid GraphQL JSON"); }
  if (Array.isArray(body.errors) && body.errors.length) throw new Error(body.errors.map((item) => item.message || "GraphQL error").join("; "));
  return body;
}

function domRecords(type, limit) {
  return page => page.evaluate(({ resultType, resultLimit }) => {
    const main = document.querySelector("main") || document.body;
    const lines = value => (value || "").split(/\r?\n+/).map(line => line.trim()).filter(Boolean);
    const absolute = value => { try { return value ? new URL(value, location.origin).toString() : null; } catch { return null; } };
    const results = [];
    const seen = new Set();
    const add = (key, record) => { if (!key || seen.has(key)) return; seen.add(key); results.push(record); };
    const cardImage = card => {
      const images = [...card.querySelectorAll("img")];
      const image = images.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || images.at(-1);
      return image?.currentSrc || image?.src || null;
    };
    const cards = typeName => [...main.querySelectorAll(`[data-testid="${typeName}"]`)];

    if (resultType === "posts") {
      for (const card of cards("post-preview")) {
        const title = card.getAttribute("aria-label") || null;
        const links = [...card.querySelectorAll("a[href]")];
        const article = links.filter(link => link.href.includes("medium.com/") && !/\/search(?:[/?]|$)/.test(link.href))
          .sort((a, b) => b.href.length - a.href.length)[0];
        const author = links.find(link => /^\/\@[^/]+(?:\?|$)/.test(new URL(link.href).pathname));
        if (!article) continue;
        const articleUrl = (() => { try { const url = new URL(article.href); url.search = ""; return url.toString(); } catch { return article.href; } })();
        const cardLines = lines(card.innerText);
        const titleIndex = title ? cardLines.indexOf(title) : -1;
        const subtitle = titleIndex >= 0 && cardLines[titleIndex + 1] && !/^\d[\d,.]*$/.test(cardLines[titleIndex + 1]) ? cardLines[titleIndex + 1] : null;
        add(article.href, {
          kind: "post", rendererType: "dom", native: null, id: null, title, mediumUrl: articleUrl,
          uniqueSlug: null, creator: author ? { id: null, name: author.innerText.trim() || null, username: new URL(author.href).pathname.slice(2).split("?")[0], imageId: null } : null,
          collection: null, tags: [], previewImage: cardImage(card) ? { id: null, url: cardImage(card), alt: null } : null,
          extendedPreviewContent: { subtitle, isFullContent: null },
          firstPublishedAt: null, latestPublishedAt: null, readingTime: null, clapCount: null, postResponses: { count: null }, isLocked: null,
          text: (card.innerText || "").trim()
        });
        if (results.length >= resultLimit) break;
      }
    } else if (resultType === "people" || resultType === "publications") {
      const testid = resultType === "people" ? "search-user-preview" : "search-pub-preview";
      for (const card of cards(testid)) {
        const cardLines = lines(card.innerText);
        const link = card.querySelector("a[href]");
        if (!cardLines[0] || !link) continue;
        const href = absolute(link.getAttribute("href"));
        const record = resultType === "people"
          ? { kind: "person", rendererType: "dom", native: null, id: null, name: cardLines[0], username: href?.match(/\/\@([^/?#]+)/)?.[1] || null, bio: cardLines.slice(1).filter(line => line !== "Follow").join(" ") || null, imageId: cardImage(card), url: href, text: cardLines.join("\n") }
          : { kind: "publication", rendererType: "dom", native: null, id: null, name: cardLines[0], description: cardLines.slice(1).filter(line => line !== "Follow").join(" ") || null, domain: href, slug: href ? new URL(href).pathname.slice(1) : null, avatar: cardImage(card) ? { id: null, url: cardImage(card) } : null, url: href, text: cardLines.join("\n") };
        add(href, record);
        if (results.length >= resultLimit) break;
      }
    } else if (resultType === "topics") {
      const pageLines = lines(main.innerText);
      const topicStart = pageLines.indexOf("Topics") + 1;
      const topicEnd = pageLines.indexOf("Show more", topicStart);
      const names = pageLines.slice(topicStart, topicEnd >= 0 ? topicEnd : pageLines.length).filter(line => line !== "Lists");
      for (const name of names) { if (name) add(`topic:${name}`, { kind: "topic", rendererType: "dom", native: null, id: name.toLowerCase().replace(/\s+/g, "-"), name, displayTitle: name, normalizedTagSlug: name.toLowerCase().replace(/\s+/g, "-"), url: `https://medium.com/tag/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}`, text: name }); if (results.length >= resultLimit) break; }
    } else if (resultType === "lists") {
      const pageLines = lines(main.innerText);
      const navIndex = pageLines.indexOf("Lists");
      const end = pageLines.indexOf("Show more", navIndex + 1);
      const listLines = pageLines.slice(navIndex + 1, end >= 0 ? end : pageLines.length);
      for (let i = 0; i + 2 < listLines.length && results.length < resultLimit; i += 3) {
        if (/^\d[\d,.]* stories?$/i.test(listLines[i + 2])) add(`list:${listLines[i]}:${listLines[i + 1]}`, { kind: "list", rendererType: "dom", native: null, id: null, name: listLines[i + 1], creator: { id: null, name: listLines[i], username: null }, description: null, postItemsCount: listLines[i + 2], url: null, text: listLines.slice(i, i + 3).join("\n") });
      }
    }
    return results.slice(0, resultLimit);
  }, { resultType: type, resultLimit: limit });
}

export default async (page, params, cwd) => {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query) fail("MISSING_PARAM", "query is required");
  const type = String(params.type).toLowerCase();
  if (!TYPES.has(type)) fail("INVALID_PARAM", `type must be one of ${[...TYPES].join(", ")}`);
  const rawLimit = String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) fail("INVALID_PARAM", "limit must be a positive integer");
  const limit = Number(rawLimit);
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  const sort = String(params.sort).toLowerCase();
  if (!SORTS.has(sort)) fail("INVALID_PARAM", `sort must be one of ${[...SORTS].join(", ")}`);
  const time = String(params.time).toLowerCase();
  if (!TIMES.has(time)) fail("INVALID_PARAM", `time must be one of ${[...TIMES].join(", ")}`);

  const ignoredParams = [];
  if (sort !== "default") ignoredParams.push(`sort=${sort}`);
  if (time !== "all") ignoredParams.push(`time=${time}`);
  const url = searchUrl(query, type);
  const graphqlQuery = type === "posts" ? POST_QUERY : ENTITY_QUERY;
  const pages = [];
  let apiFailure = null;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(randomBetween(300, 650));
    await lightHumanize(page);
    const records = [];
    const seen = new Set();
    let pageNumber = 0;
    for (let attempt = 0; attempt < 8 && records.length < limit; attempt += 1) {
      if (attempt > 0) { await page.waitForTimeout(randomBetween(220, 520)); pageNumber = pages.at(-1)?.nextPage ?? pageNumber + 1; }
      const body = await readGraphql(page, graphqlQuery, { query, pagingOptions: { limit: Math.min(MAX_LIMIT, limit), page: pageNumber } });
      const parsed = nativePage(body, type);
      pages.push({ body, page: pageNumber, nextPage: parsed.nextPage });
      for (const item of parsed.items) { const key = resultKey(item, type); if (!seen.has(key)) { seen.add(key); records.push(item); } }
      if (parsed.items.length === 0 || parsed.nextPage === null || parsed.nextPage === pageNumber) break;
      pageNumber = parsed.nextPage;
    }
    if (!pages.length) throw new Error("GraphQL returned no page");
    await page.waitForTimeout(randomBetween(0, 450));
    const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: records.slice(0, limit), resultCount: Math.min(records.length, limit), pagesFetched: pages.length, source: "api", fallbackUsed: false, nativeEnvelope: { pages: pages.map(item => item.body) } };
    if (ignoredParams.length) output.ignoredParams = ignoredParams;
    return output;
  } catch (error) {
    apiFailure = error instanceof Error ? error.message : String(error);
  }

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(selectorFor(type), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(randomBetween(300, 700));
    await lightHumanize(page, true);
    const records = await domRecords(type, limit)(page);
    if (!Array.isArray(records) || records.length === 0) fail("DRIFT_DETECTED", `Medium API and DOM extraction failed: ${apiFailure || "no visible results"}`);
    await page.waitForTimeout(randomBetween(0, 450));
    const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: records, resultCount: records.length, pagesFetched: 1, source: "dom", fallbackUsed: true, partial: true, fallbackReason: apiFailure };
    if (ignoredParams.length) output.ignoredParams = ignoredParams;
    return output;
  } catch (error) {
    if (error?.code === "DRIFT_DETECTED") throw error;
    fail("DRIFT_DETECTED", `Medium API and DOM extraction failed: ${apiFailure || error.message || "unknown error"}`);
  }
};
