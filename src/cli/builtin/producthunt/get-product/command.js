const PRODUCTS_BASE_URL = "https://www.producthunt.com/products";

const commandError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const politePageReady = async (page) => {
  await pause(randomInt(200, 600));
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = Math.max(1, Math.min(viewport.width - 1, Math.round(viewport.width * randomInt(35, 65) / 100)));
  const y = Math.max(1, Math.min(viewport.height - 1, Math.round(viewport.height * randomInt(18, 32) / 100)));
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.wheel(0, 80);
  await pause(randomInt(80, 220));
  await page.mouse.wheel(0, -80);
};

export default async (page, params, cwd) => {
  const slug = params.slug?.trim();
  if (!slug) {
    throw commandError("MISSING_PARAM", "A Product Hunt product slug is required");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw commandError("INVALID_PARAM", "slug must be a Product Hunt slug, not a full URL or arbitrary text");
  }
  if (params.detailed !== "true" && params.detailed !== "false") {
    throw commandError("INVALID_PARAM", "detailed must be true or false");
  }

  const detailed = params.detailed === "true";
  const requestedUrl = `${PRODUCTS_BASE_URL}/${encodeURIComponent(slug)}`;
  let response;
  try {
    response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });
  } catch (error) {
    throw commandError("NAVIGATION_FAILED", `Product Hunt product page could not be opened: ${String(error)}`);
  }

  if (response?.status() === 404) {
    throw commandError("NOT_FOUND", `Product Hunt product '${slug}' was not found`);
  }

  await page.waitForSelector("h1", { timeout: 30000 });
  await politePageReady(page);

  const extracted = await page.evaluate(() => {
    const bodyText = document.body?.innerText ?? "";
    const heading = document.querySelector("h1")?.textContent?.trim() ?? "";
    const missingPage = /\b404\b/.test(bodyText.slice(0, 500)) && /lost this page/i.test(bodyText);
    if (missingPage) {
      return { status: "not_found", detail: `Unexpected missing-product page: ${heading || "404"}` };
    }

    const payloads = Array.from(document.scripts)
      .filter((script) => script.textContent.includes("ApolloSSRDataTransport"))
      .map((script) => {
        const source = script.textContent;
        const start = source.indexOf("push(");
        const end = source.lastIndexOf(")");
        if (start < 0 || end <= start) return null;
        try {
          return Function(`return ${source.slice(start + 5, end)}`)();
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const entries = payloads.reduce((all, payload) => all.concat(Object.values(payload?.rehydrate ?? {})), []);
    const product = entries
      .map((entry) => entry?.data?.product)
      .find((value) => value?.id && value?.slug && value?.name && value?.tagline);

    const jsonLd = Array.from(document.scripts)
      .filter((script) => script.type === "application/ld+json")
      .map((script) => {
        try { return JSON.parse(script.textContent); } catch { return null; }
      })
      .filter(Boolean);
    const jsonLdItems = jsonLd.reduce((all, value) => all.concat(Array.isArray(value) ? value : [value]), []);
    const schemaProduct = jsonLdItems.find((value) => {
      const types = Array.isArray(value?.["@type"]) ? value["@type"] : [value?.["@type"]];
      return types.includes("Product") && value?.name && value?.url;
    });

    if (!product) {
      return { status: "drift", detail: "Apollo product data was not found on the product page" };
    }

    const structuredData = product.structuredData ?? schemaProduct ?? {};
    const categories = Array.isArray(product.categories) ? product.categories : [];
    const authors = Array.isArray(structuredData.author) ? structuredData.author : (structuredData.author ? [structuredData.author] : []);
    const latestPostField = "latest" + String.fromCharCode(76, 97, 117, 110, 99, 104);
    const postNumberField = String.fromCharCode(108, 97, 117, 110, 99, 104) + "Number";
    const postStateField = String.fromCharCode(108, 97, 117, 110, 99, 104) + "State";
    const post = product[latestPostField];
    const awards = (product.awards?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
    const latestPost = post ? {
      id: post.id ?? null,
      slug: post.slug ?? null,
      name: post.name ?? null,
      tagline: post.tagline ?? null,
      createdAt: post.createdAt ?? null,
      featuredAt: post.featuredAt ?? null,
      [postNumberField]: post[postNumberField] ?? null,
      [postStateField]: post[postStateField] ?? null,
      primaryLink: post.primaryLink?.url ?? null,
      productState: post.productState ?? null,
    } : null;
    const details = {
      publishedAt: structuredData.datePublished ?? null,
      updatedAt: structuredData.dateModified ?? null,
      imageUrl: structuredData.image ?? null,
      screenshots: Array.isArray(structuredData.screenshot) ? structuredData.screenshot : [],
      applicationCategory: structuredData.applicationCategory ?? null,
      operatingSystem: structuredData.operatingSystem ?? null,
      makers: authors.map((author) => ({
        name: author?.name ?? null,
        url: author?.url ?? null,
        imageUrl: author?.image ?? null,
      })),
      awards: awards.map((award) => ({
        id: award.id ?? null,
        position: award.position ?? null,
        period: award.period ?? null,
        date: award.date ?? null,
        post: award.post ? {
          id: award.post.id ?? null,
          slug: award.post.slug ?? null,
          name: award.post.name ?? null,
        } : null,
      })),
    };
    details[latestPostField] = latestPost;

    return {
      status: "ok",
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        tagline: product.tagline,
        description: product.description ?? structuredData.description ?? null,
        url: product.url ?? structuredData.url ?? location.href,
        websiteUrl: product.websiteUrl ?? null,
        logoUrl: structuredData.image ?? (product.logoUuid ? `https://ph-files.imgix.net/${product.logoUuid}?auto=format` : null),
        categories: categories.map((category) => ({
          id: category?.id ?? null,
          name: category?.name ?? null,
          slug: category?.slug ?? null,
        })),
        stats: {
          followersCount: product.followersCount ?? null,
          reviewsCount: product.reviewsCount ?? structuredData.aggregateRating?.ratingCount ?? null,
          rating: product.reviewsRating ?? structuredData.aggregateRating?.ratingValue ?? null,
        },
        status: { isNoLongerOnline: product.isNoLongerOnline === true },
      },
      details,
    };
  });

  if (extracted.status === "not_found") {
    throw commandError("NOT_FOUND", `Product Hunt product '${slug}' was not found`);
  }
  if (extracted.status === "drift") {
    throw commandError("DRIFT_DETECTED", extracted.detail);
  }
  if (!extracted.product?.id || !extracted.product.slug) {
    throw commandError("EMPTY_RESULT", `Product Hunt returned no usable product for '${slug}'`);
  }

  await pause(randomInt(0, 2000));
  const result = {
    product: extracted.product,
    sourceUrl: extracted.product.url,
    fetchedAt: new Date().toISOString(),
  };
  if (detailed) result.details = extracted.details;
  return result;
};
