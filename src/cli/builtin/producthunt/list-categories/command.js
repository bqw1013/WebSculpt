const CATEGORIES_URL = "https://www.producthunt.com/categories";

const commandError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const randomInt = (minimum, maximum) =>
  Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const addCourtesyPacing = async (page) => {
  // Keep the interaction short, bounded, and reversible: one pointer move and
  // a small down/up scroll instead of repeated activity or long idle periods.
  await pause(randomInt(300, 900));

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = Math.max(
    1,
    Math.min(viewport.width - 1, Math.round((viewport.width * randomInt(35, 65)) / 100)),
  );
  const y = Math.max(
    1,
    Math.min(viewport.height - 1, Math.round((viewport.height * randomInt(20, 40)) / 100)),
  );

  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.wheel(0, 120);
  await pause(randomInt(100, 350));
  await page.mouse.wheel(0, -120);
};

export default async (page, params, cwd) => {
  if (
    params.detailed !== undefined &&
    params.detailed !== "true" &&
    params.detailed !== "false"
  ) {
    throw commandError("INVALID_PARAM", "detailed must be true or false");
  }

  const detailed = params.detailed === "true";

  await page.goto(CATEGORIES_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 30000 });
  await addCourtesyPacing(page);

  const extracted = await page.evaluate(() => {
    const heading = document.querySelector("h1")?.textContent?.trim() ?? "";
    if (heading !== "Product Categories") {
      return { status: "drift", detail: `Unexpected page heading: ${heading || "<empty>"}` };
    }

    const transportScript = [...document.scripts].find((script) =>
      script.textContent.includes("ApolloSSRDataTransport"),
    );
    if (!transportScript) {
      return { status: "drift", detail: "Apollo SSR transport script was not found" };
    }

    const source = transportScript.textContent;
    const pushStart = source.indexOf("push(");
    const pushEnd = source.lastIndexOf(")");
    if (pushStart < 0 || pushEnd <= pushStart) {
      return { status: "drift", detail: "Apollo SSR transport payload boundary was not found" };
    }

    let payload;
    try {
      payload = Function(`return ${source.slice(pushStart + 5, pushEnd)}`)();
    } catch (error) {
      return { status: "drift", detail: `Apollo SSR payload could not be parsed: ${String(error)}` };
    }

    const entry = Object.values(payload?.rehydrate ?? {}).find(
      (value) => value?.data?.productCategories,
    );
    const connection = entry?.data?.productCategories;
    if (!connection || !Array.isArray(connection.edges)) {
      return { status: "drift", detail: "productCategories connection was not found" };
    }

    const absoluteUrl = (path) => (path ? new URL(path, location.origin).href : null);
    const categories = connection.edges
      .map((edge) => edge?.node)
      .filter(Boolean)
      .map((node) => {
        const path = node.path ?? null;
        const segments = path?.split("/").filter(Boolean) ?? [];
        return {
          id: node.id ?? null,
          name: node.name ?? null,
          slug: segments[segments.length - 1] ?? null,
          url: absoluteUrl(path),
          subCategories: (node.subCategories?.nodes ?? []).map((subCategory) => {
            const subPath = subCategory.path ?? null;
            const subSegments = subPath?.split("/").filter(Boolean) ?? [];
            return {
              id: subCategory.id ?? null,
              name: subCategory.name ?? null,
              slug: subSegments[subSegments.length - 1] ?? null,
              description: subCategory.description ?? null,
              url: absoluteUrl(subPath),
            };
          }),
        };
      });

    return {
      status: "ok",
      categories,
      pageInfo: {
        endCursor: connection.pageInfo?.endCursor ?? null,
        hasNextPage: connection.pageInfo?.hasNextPage === true,
      },
    };
  });

  if (extracted.status === "drift") {
    throw commandError("DRIFT_DETECTED", extracted.detail);
  }
  if (!extracted.categories.length) {
    throw commandError("EMPTY_RESULT", "Product Hunt returned no product categories");
  }

  const compactCategories = extracted.categories.map(({ id, name, slug, subCategories }) => ({
    id,
    name,
    slug,
    subCategories: subCategories.map(({ id: subId, name: subName, slug: subSlug }) => ({
      id: subId,
      name: subName,
      slug: subSlug,
    })),
  }));

  await pause(randomInt(0, 2000));

  if (!detailed) {
    return {
      categories: compactCategories,
      count: compactCategories.length,
      hasNextPage: extracted.pageInfo.hasNextPage,
    };
  }

  return {
    sourceUrl: CATEGORIES_URL,
    fetchedAt: new Date().toISOString(),
    categories: extracted.categories,
    pageInfo: extracted.pageInfo,
    count: extracted.categories.length,
  };
};
