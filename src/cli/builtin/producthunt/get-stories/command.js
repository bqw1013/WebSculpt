const STORIES_URL = "https://www.producthunt.com/stories";
const CATEGORY_URL = "https://www.producthunt.com/stories/category/";

const commandError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const politePace = async (page) => {
  await pause(randomInt(250, 650));
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  if (Math.random() < 0.5) {
    await page.mouse.move(
      Math.max(1, Math.min(viewport.width - 1, Math.round(viewport.width * (0.35 + Math.random() * 0.3)))),
      Math.max(1, Math.min(viewport.height - 1, Math.round(viewport.height * (0.2 + Math.random() * 0.3)))),
      { steps: 3 },
    );
  } else {
    await page.mouse.wheel(0, 100);
    await page.mouse.wheel(0, -100);
  }
};

const extractPageData = async (page, mode) => page.evaluate((requestedMode) => {
  const storyUrl = (slug) => new URL(`/stories/${slug}`, location.origin).href;
  const normalizeNode = (node, section) => {
    if (!node?.id || !node.title || !node.slug) return null;
    const author = node.author ?? {};
    return {
      id: node.id,
      title: node.title.trim(),
      slug: node.slug,
      url: storyUrl(node.slug),
      description: node.description ?? null,
      headerImageUuid: node.headerImageUuid ?? null,
      minsToRead: Number.isInteger(node.minsToRead) ? node.minsToRead : null,
      category: node.category ? { name: node.category.name ?? null, slug: node.category.slug ?? null } : null,
      author: {
        id: author.id ?? null,
        name: author.name ?? node.authorName ?? null,
        username: author.username ?? null,
        url: node.authorUrl || (author.username ? new URL(`/@${author.username}`, location.origin).href : null),
      },
      section,
    };
  };

  if (requestedMode === "query") {
    const heading = [...document.querySelectorAll("div")].find(
      (element) => element.children.length === 0 && element.textContent.trim() === "More stories",
    );
    const container = heading?.closest("header");
    if (!container) return { status: "drift", detail: "More stories result container was not found" };
    const byUrl = new Map();
    for (const link of container.querySelectorAll("a[href]")) {
      const url = new URL(link.href, location.origin);
      if (!/^\/stories\/[^/]+$/.test(url.pathname) || !link.textContent.trim()) continue;
      let card = link;
      while (card && card !== container) {
        const categoryLink = [...card.querySelectorAll("a[href]")].find((candidate) =>
          new URL(candidate.href, location.origin).pathname.startsWith("/stories/category/"),
        );
        if (categoryLink) break;
        card = card.parentElement;
      }
      const categoryLink = card && [...card.querySelectorAll("a[href]")].find((candidate) =>
        new URL(candidate.href, location.origin).pathname.startsWith("/stories/category/"),
      );
      const authorLink = card && [...card.querySelectorAll("a[href]")].find((candidate) =>
        new URL(candidate.href, location.origin).pathname.startsWith("/@"),
      );
      const categoryPath = categoryLink ? new URL(categoryLink.href, location.origin).pathname : "";
      const categorySlug = categoryPath.startsWith("/stories/category/")
        ? categoryPath.slice("/stories/category/".length)
        : null;
      const cardText = card?.innerText ?? "";
      const minutes = cardText.match(/(\d+)\s+min\s+read/i);
      byUrl.set(url.href, {
        id: null,
        title: link.textContent.trim(),
        slug: url.pathname.slice("/stories/".length),
        url: url.href,
        description: null,
        headerImageUuid: null,
        imageUrl: card?.querySelector("img")?.src ?? null,
        minsToRead: minutes ? Number.parseInt(minutes[1], 10) : null,
        category: categoryLink ? { name: categoryLink.textContent.trim(), slug: categorySlug } : null,
        author: authorLink
          ? { id: null, name: authorLink.textContent.trim(), username: new URL(authorLink.href).pathname.slice(2), url: authorLink.href }
          : { id: null, name: null, username: null, url: null },
        section: "search",
      });
    }
    return { status: "ok", items: [...byUrl.values()], pageInfo: null, sourcePageSize: byUrl.size };
  }

  const transport = [...document.scripts].find((script) => script.textContent.includes("ApolloSSRDataTransport"));
  if (!transport) return { status: "drift", detail: "Apollo SSR transport script was not found" };
  const source = transport.textContent;
  const pushStart = source.indexOf("push(");
  const pushEnd = source.lastIndexOf(")");
  if (pushStart < 0 || pushEnd <= pushStart) return { status: "drift", detail: "Apollo SSR payload boundary was not found" };
  let payload;
  try {
    payload = Function(`return ${source.slice(pushStart + 5, pushEnd)}`)();
  } catch (error) {
    return { status: "drift", detail: `Apollo SSR payload could not be parsed: ${String(error)}` };
  }
  const dataFor = (key) => Object.values(payload?.rehydrate ?? {}).map((entry) => entry.data?.[key]).find(Boolean);
  if (requestedMode === "category") {
    const category = dataFor("storyCategory");
    const connection = category?.stories;
    if (!category || !connection || !Array.isArray(connection.edges)) {
      return { status: "drift", detail: "Story category connection was not found" };
    }
    return {
      status: "ok",
      filterCategory: { name: category.name ?? null, slug: category.slug ?? null, description: category.description ?? null },
      items: connection.edges.map((edge) => normalizeNode(edge?.node, "category")).filter(Boolean),
      pageInfo: {
        endCursor: connection.pageInfo?.endCursor ?? null,
        hasNextPage: connection.pageInfo?.hasNextPage === true,
      },
      sourcePageSize: connection.edges.length,
    };
  }
  const stories = dataFor("stories");
  const featured = dataFor("storiesFeatured");
  if (!stories || !Array.isArray(stories.edges) || !featured) {
    return { status: "drift", detail: "All-stories SSR connections were not found" };
  }
  const featuredItems = [featured.firstSection, ...(featured.categorySection ?? [])]
    .map((node) => normalizeNode(node, "featured"))
    .filter(Boolean);
  return {
    status: "ok",
    items: [...featuredItems, ...stories.edges.map((edge) => normalizeNode(edge?.node, "more")).filter(Boolean)],
    pageInfo: {
      endCursor: stories.pageInfo?.endCursor ?? null,
      hasNextPage: stories.pageInfo?.hasNextPage === true,
    },
    sourcePageSize: stories.edges.length,
  };
}, mode);

const compactItem = (item) => ({
  id: item.id,
  title: item.title,
  slug: item.slug,
  url: item.url,
  category: item.category,
  author: item.author,
  minsToRead: item.minsToRead,
});

const detailedItem = (item) => ({
  ...compactItem(item),
  description: item.description,
  headerImageUuid: item.headerImageUuid,
  imageUrl: item.imageUrl ?? null,
  section: item.section,
});

export default async (page, params, cwd) => {
  const category = typeof params.category === "string" ? params.category.trim() : "";
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const detailed = params.detailed === "true";
  const limitText = typeof params.limit === "string" ? params.limit : "";

  if (category && query) throw commandError("INVALID_PARAM", "category and query are mutually exclusive");
  if (params.query !== undefined && !query) throw commandError("INVALID_PARAM", "query must not be blank");
  if (category && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) {
    throw commandError("INVALID_PARAM", "category must be a Product Hunt Stories slug");
  }
  if (params.detailed !== undefined && params.detailed !== "true" && params.detailed !== "false") {
    throw commandError("INVALID_PARAM", "detailed must be true or false");
  }
  if (!/^\d+$/.test(limitText)) throw commandError("INVALID_PARAM", "limit must be an integer from 1 through 25");
  const limit = Number.parseInt(limitText, 10);
  if (limit < 1 || limit > 25) throw commandError("INVALID_PARAM", "limit must be an integer from 1 through 25");

  const mode = query ? "query" : category ? "category" : "all";
  const sourceUrl = category ? `${CATEGORY_URL}${encodeURIComponent(category)}` : STORIES_URL;
  let response;
  try {
    response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
  } catch (error) {
    throw commandError("PAGE_UNAVAILABLE", `Product Hunt Stories could not be loaded: ${String(error)}`);
  }
  if (response?.status() === 404) throw commandError("NOT_FOUND", `Stories category was not found: ${category}`);
  await page.waitForSelector("main", { timeout: 30000 });
  await politePace(page);

  if (mode === "query") {
    const input = page.locator('[data-test="stories-index-search-input"]');
    await input.fill(query);
    await input.press("Enter");
    await pause(randomInt(900, 1300));
  }

  const extracted = await extractPageData(page, mode);
  if (extracted.status === "drift") throw commandError("DRIFT_DETECTED", extracted.detail);
  if (!extracted.items?.length) throw commandError("EMPTY_RESULT", "Product Hunt Stories returned no matching articles");

  const items = extracted.items.slice(0, limit).map(detailed ? detailedItem : compactItem);
  const pagination = mode === "query"
    ? { supported: false, sourcePageSize: extracted.sourcePageSize, reason: "Search Stories filters the loaded More stories section; no upstream page control was verified" }
    : { supported: false, sourcePageSize: extracted.sourcePageSize, endCursor: extracted.pageInfo?.endCursor ?? null, hasNextPage: extracted.pageInfo?.hasNextPage === true, reason: "The source exposes a cursor but no verified page-number URL or next-page control" };

  await pause(randomInt(0, 2000));
  return {
    sourceUrl: page.url(),
    filter: { category: category || null, query: query || null },
    resultScope: mode === "all" ? "featured-and-more" : mode === "category" ? "category-page" : "search-filtered-more-stories",
    items,
    count: items.length,
    sourceCount: extracted.items.length,
    pagination,
    fetchedAt: detailed ? new Date().toISOString() : undefined,
    category: detailed && extracted.filterCategory ? extracted.filterCategory : undefined,
  };
};
