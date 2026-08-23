const CATEGORY_ROOT = "https://www.producthunt.com/categories/";

const commandError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const parsePositiveInteger = (value, name) => {
  if (!/^\d+$/.test(value)) throw commandError("INVALID_PARAM", `${name} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw commandError("INVALID_PARAM", `${name} must be a positive integer`);
  return number;
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const politeInteraction = async (page) => {
  await pause(randomInt(200, 500));
  const viewport = page.viewportSize?.() ?? { width: 1280, height: 720 };
  const x = Math.max(1, Math.min(viewport.width - 1, Math.round(viewport.width * (0.4 + Math.random() * 0.2))));
  const y = Math.max(1, Math.min(viewport.height - 1, Math.round(viewport.height * (0.2 + Math.random() * 0.2))));
  await page.mouse.move(x, y, { steps: 3 });
};

const extractPage = (state, categorySlug, pageNumber, detailed) => {
  const parseNumber = (value) => Number(String(value).replace(/,/g, ""));
  if (/404|not found|doesn't exist/i.test(`${state.title} ${state.h1} ${state.bodyPreview}`)) return { status: "not_found" };

  let collection = null;
  for (const script of state.jsonLdScripts) {
    try {
      const value = JSON.parse(script);
      if (value?.["@type"] === "CollectionPage" && Array.isArray(value.mainEntity?.itemListElement)) {
        collection = value;
        break;
      }
    } catch {
      // Ignore unrelated JSON-LD blocks.
    }
  }
  if (!collection) return { status: "drift", detail: "CollectionPage JSON-LD with an ItemList was not found" };

  const showing = state.showing.match(/Showing\s+(\d+)-(\d+)\s+of\s+([\d,]+)\s+products/i);
  if (!showing) return { status: "drift", detail: "Product pagination summary was not found" };
  const totalCount = parseNumber(showing[3]);
  const pageSize = Number(showing[2]) - Number(showing[1]) + 1;
  const products = collection.mainEntity.itemListElement.map((entry) => {
    const item = entry?.item;
    if (!item?.url || !item.name) return null;
    const url = new URL(item.url, state.origin).href;
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
    const card = state.cards.find((candidate) => candidate.slug === slug && !candidate.promoted);
    const product = {
      rank: Number(showing[1]) + Number(entry.position ?? 1) - 1,
      name: item.name,
      slug,
      url,
      tagline: card?.tagline ?? null,
      rating: item.aggregateRating?.ratingValue == null ? null : Number(item.aggregateRating.ratingValue),
      reviewCount: item.aggregateRating?.ratingCount == null ? null : Number(item.aggregateRating.ratingCount),
    };
    if (detailed) {
      product.description = item.description ?? null;
      product.datePublished = item.datePublished ?? null;
      product.dateModified = item.dateModified ?? null;
      product.image = item.image ?? null;
      product.operatingSystem = item.operatingSystem ?? null;
      product.applicationCategory = item.applicationCategory ?? null;
      product.categories = card?.categories ?? [];
      product.makers = Array.isArray(item.author) ? item.author.map((maker) => ({ name: maker.name ?? null, url: maker.url ?? null })) : [];
    }
    return product;
  }).filter(Boolean);
  if (!products.length) return { status: "empty" };

  return {
    status: "ok",
    data: {
      sourceUrl: state.url,
      category: { name: state.categoryName, slug: categorySlug, url: new URL(`/categories/${categorySlug}`, state.origin).href },
      ranking: "top-reviewed",
      snapshot: { title: state.h1, lastUpdated: state.lastUpdated, productsConsidered: parseNumber(state.productsConsidered) },
      pageInfo: {
        page: pageNumber,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
      },
      products,
      retrievedAt: detailed ? new Date().toISOString() : undefined,
    },
  };
};

// Helper functions can be defined above export default
export default async (page, params, cwd) => {
  const category = String(params.category ?? "").trim();
  if (!category) throw commandError("MISSING_PARAM", "category is required; use a slug from list-categories");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(category)) throw commandError("INVALID_PARAM", "category must be a Product Hunt slug");
  const pageNumber = parsePositiveInteger(params.page, "page");
  const limit = parsePositiveInteger(params.limit, "limit");
  if (limit > 15) throw commandError("INVALID_PARAM", "limit must be between 1 and 15");
  if (params.detailed !== "true" && params.detailed !== "false") throw commandError("INVALID_PARAM", "detailed must be true or false");

  const url = new URL(category, CATEGORY_ROOT);
  if (pageNumber > 1) url.searchParams.set("page", String(pageNumber));
  url.hash = "content";
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body", { timeout: 30000 });
  await politeInteraction(page);

  const state = await page.evaluate((options) => {
    const body = document.body.innerText;
    const section = document.querySelector("section#content");
    const list = [...(section?.querySelectorAll("ul") ?? [])].find((candidate) => candidate.children.length >= 15 && /reviews/.test(candidate.innerText));
    const cards = [...(list?.children ?? [])].map((li) => {
      const promoted = Boolean(li.querySelector("img[alt='Promoted']"));
      const productLink = [...li.querySelectorAll("a")].find((a) => {
        const href = a.getAttribute("href") ?? "";
        return /^\/products\/[^/?#]+$/.test(href) && Boolean(a.querySelector("span"));
      });
      const href = productLink?.getAttribute("href") ?? "";
      const slug = href.split("/").filter(Boolean).pop() ?? null;
      const tagline = [...(productLink?.querySelectorAll("span") ?? [])].find((span) => String(span.className).includes("text-secondary"))?.textContent?.trim() || null;
      const categories = [...li.querySelectorAll("a")]
        .filter((a) => (a.getAttribute("href") ?? "").startsWith("/categories/"))
        .map((a) => ({ name: a.textContent.trim(), slug: a.getAttribute("href").split("/").filter(Boolean).pop() }))
        .filter((item) => item.name && item.slug);
      return { slug, tagline, promoted, categories };
    });
    const jsonLdScripts = [...document.querySelectorAll("script")].filter((script) => script.type === "application/ld+json").map((script) => script.textContent ?? "");
    const categoryLink = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === `/categories/${options.category}` && a.textContent.trim());
    return {
      url: location.href,
      origin: location.origin,
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      bodyPreview: body.slice(0, 1200),
      categoryName: categoryLink?.textContent?.trim() ?? options.category,
      lastUpdated: body.match(/Last updated\s+([^\n]+)/i)?.[1]?.trim() ?? null,
      productsConsidered: body.match(/Products considered\s+([\d,]+)/i)?.[1] ?? "0",
      showing: body.match(/Showing\s+\d+-\d+\s+of\s+[\d,]+\s+products/i)?.[0] ?? "",
      jsonLdScripts,
      cards,
    };
  }, { category });

  const result = extractPage(state, category, pageNumber, params.detailed === "true");
  if (result.status === "not_found") throw commandError("NOT_FOUND", `Product Hunt category was not found: ${category}`);
  if (result.status === "drift") throw commandError("DRIFT_DETECTED", result.detail);
  if (result.status === "empty") throw commandError("EMPTY_RESULT", `No Best Products were returned for category: ${category}`);
  result.data.products = result.data.products.slice(0, limit);
  if (params.detailed === "false") delete result.data.retrievedAt;
  await pause(randomInt(0, 2000));
  return result.data;
};
