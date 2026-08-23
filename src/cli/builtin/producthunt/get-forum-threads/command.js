const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const commandError = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const politePacing = async (page) => {
  await pause(randomInt(200, 550));
  try {
    await page.mouse.move(640, 240, { steps: 3 });
  } catch {
    // Pointer movement is courtesy behavior; extraction must remain usable if unavailable.
  }
};

export default async (page, params, cwd) => {
  const forumSlug = String(params.forum).trim().toLowerCase();
  const limitText = String(params.limit).trim();
  const limit = Number(limitText);
  const detailed = params.detailed === "true";

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(forumSlug)) {
    throw commandError("INVALID_PARAM", "forum must be a Product Hunt forum slug");
  }
  if (!/^(?:0|[1-9]\d*)$/.test(limitText) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw commandError("INVALID_PARAM", "limit must be an integer from 1 through 50");
  }
  if (params.detailed !== "true" && params.detailed !== "false") {
    throw commandError("INVALID_PARAM", "detailed must be true or false");
  }

  const sourceUrl = `https://www.producthunt.com/p/${forumSlug}`;
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body", { timeout: 30000 });
  await page.waitForSelector("main", { timeout: 5000 }).catch(() => null);
  await politePacing(page);

  const extracted = await page.evaluate((expected) => {
    const absoluteUrl = (href) => (href ? new URL(href, location.origin).href : null);
    const main = document.querySelector("main");
    const mainText = (main?.innerText ?? document.body?.innerText ?? "").slice(0, 1800);
    const pageTitle = document.title ?? "";
    const notFound = /\b404\b|page not found|does not exist|could not be found|couldn't find/i.test(`${pageTitle} ${mainText}`);
    if (notFound) {
      return { status: "not-found" };
    }
    if (!main) {
      return { status: "drift", detail: "Forum main content container was not found" };
    }

    const expectedForumPath = `/p/${expected.forumSlug}`;
    const hasForumMarker = mainText.includes(`p/${expected.forumSlug}`)
      || [...main.querySelectorAll("a, img, [role=heading], h1, h2, h3")].some(
      (element) => (element.textContent ?? "").trim() === `p/${expected.forumSlug}`
        || element.getAttribute("alt") === expected.forumSlug
        || element.getAttribute("href") === expectedForumPath,
      );
    if (!hasForumMarker) {
      return { status: "drift", detail: `Forum marker p/${expected.forumSlug} was not found` };
    }

    let forumType = null;
    const matchingSidebarLink = [...document.querySelectorAll(`aside a[href="${expectedForumPath}"]`)].find(Boolean);
    let ancestor = matchingSidebarLink?.parentElement ?? null;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      const text = ancestor.textContent ?? "";
      if (text.includes("Topic Forums")) {
        forumType = "topic";
        break;
      }
      if (text.includes("Product Forums")) {
        forumType = "product";
        break;
      }
    }

    const threadPrefix = `${expectedForumPath}/`;
    const seen = new Set();
    const threads = [...document.querySelectorAll("main a[href]")]
      .filter((link) => {
        const path = new URL(link.href, location.origin).pathname;
        return path.startsWith(threadPrefix) && path.split("/").filter(Boolean).length === 3;
      })
      .filter((link) => {
        const href = absoluteUrl(link.getAttribute("href"));
        if (!href || seen.has(href)) return false;
        seen.add(href);
        return true;
      })
      .map((link) => {
        const url = absoluteUrl(link.getAttribute("href"));
        const path = new URL(url).pathname;
        const slug = path.split("/").filter(Boolean).pop();
        const title = link.querySelector("h2, h3")?.textContent?.trim() || link.textContent?.trim() || slug;
        const container = link.closest("article, li") ?? link.parentElement?.parentElement ?? link.parentElement;
        const cardText = container?.innerText?.trim() ?? title;
        const paragraphs = [...(container?.querySelectorAll("p") ?? [])]
          .map((paragraph) => paragraph.textContent?.trim() ?? "")
          .filter(Boolean);
        const timeLabel = paragraphs.find((value) => /\b\d+(?:mo|s|m|h|d|w|y)\s+ago\b|\b(?:today|yesterday|just now)\b/i.test(value)) ?? null;
        const excerpt = paragraphs.find((value) => value !== timeLabel && value.length > 24 && value !== title) ?? null;
        const authorLink = container?.querySelector('a[href^="/@"]');
        const authorFallback = cardText.split(/\n+/)
          .map((value) => value.trim())
          .find((value) => value && value !== "•" && value !== title && value !== "Featured"
            && !/\b\d+(?:mo|s|m|h|d|w|y)\s+ago\b|\b(?:today|yesterday|just now)\b/i.test(value)
            && !/\bonline\b/i.test(value) && !/^\d[\d,.]*$/.test(value)) ?? null;
        const engagementValues = [...(container?.querySelectorAll("button") ?? [])]
          .map((button) => button.textContent?.trim() ?? "")
          .filter((value) => /^\d[\d,.]*$/.test(value));
        return {
          slug,
          title,
          url,
          author: authorLink?.textContent?.trim() || authorFallback,
          timeLabel,
          excerpt,
          isFeatured: /\bFeatured\b/i.test(cardText),
          ...(expected.detailed ? {
            cardText: cardText.slice(0, 1200),
            engagementValues,
          } : {}),
        };
      });

    return {
      status: "ok",
      forumType,
      threads,
      renderedThreadCount: threads.length,
      pageTitle,
    };
  }, { forumSlug, detailed });

  if (extracted.status === "not-found") {
    throw commandError("NOT_FOUND", `Product Hunt forum '${forumSlug}' was not found`);
  }
  if (extracted.status === "drift") {
    throw commandError("DRIFT_DETECTED", extracted.detail);
  }
  if (!extracted.threads.length) {
    throw commandError("EMPTY_RESULT", `Product Hunt forum '${forumSlug}' has no rendered threads`);
  }

  await pause(randomInt(0, 2000));
  const threads = extracted.threads.slice(0, limit);
  return {
    sourceUrl,
    forum: { slug: forumSlug, type: extracted.forumType ?? "unknown" },
    threads,
    count: threads.length,
    limit,
    scope: "currently rendered thread cards for the selected forum page",
    pagination: {
      supported: false,
      note: "No stable upstream page or cursor parameter was verified on Product Hunt Forums.",
    },
    retrievedAt: new Date().toISOString(),
  };
};
