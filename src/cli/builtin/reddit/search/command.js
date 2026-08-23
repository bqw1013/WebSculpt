const MAX_LIMIT = 100;

function errorWithCode(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
}

function parseLimit(value) {
  const text = String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(text);
  if (!Number.isSafeInteger(limit)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a safe integer");
  }
  if (limit > MAX_LIMIT) {
    throw errorWithCode("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }
  return limit;
}

export default async (page, params, cwd) => {
  if (params.query === undefined || params.query === null) {
    throw errorWithCode("MISSING_PARAM", "query is required");
  }
  const query = String(params.query).trim();
  if (!query) {
    throw errorWithCode("EMPTY_QUERY", "query cannot be empty");
  }
  const limit = parseLimit(params.limit);
  const ignoredParams = [];

  const requestedType = String(params.type).trim().toLowerCase();
  const supportedTypes = ["post", "comment"];
  const type = supportedTypes.includes(requestedType) ? requestedType : "post";
  if (!supportedTypes.includes(requestedType)) {
    ignoredParams.push(`type=${params.type}`);
  }

  const requestedSort = String(params.sort).trim().toLowerCase();
  const sortMap = {
    default: "new",
    latest: "new",
    popular: "top"
  };
  const sort = Object.hasOwn(sortMap, requestedSort) ? requestedSort : "default";
  if (!Object.hasOwn(sortMap, requestedSort)) {
    ignoredParams.push(`sort=${params.sort}`);
  }

  const requestedTime = String(params.time).trim().toLowerCase();
  const supportedTimes = ["day", "week", "month", "year", "all"];
  const time = supportedTimes.includes(requestedTime) ? requestedTime : "all";
  if (!supportedTimes.includes(requestedTime)) {
    ignoredParams.push(`time=${params.time}`);
  }

  const requestedSubreddit = params.subreddit ? String(params.subreddit).trim().replace(/^r\//, "") : "";
  const subreddit = requestedSubreddit || null;

  const searchUrl = subreddit
    ? new URL(`https://www.reddit.com/r/${subreddit}/search/`)
    : new URL("https://www.reddit.com/search/");
  searchUrl.searchParams.set("q", query);
  if (type === "comment") searchUrl.searchParams.set("type", "comments");
  searchUrl.searchParams.set("sort", sortMap[sort]);
  searchUrl.searchParams.set("t", time);

  try {
    await page.goto(searchUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
  } catch (cause) {
    throw errorWithCode(
      "NAVIGATION_FAILED",
      `Reddit search page could not be loaded: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  const selector = type === "comment"
    ? '[data-testid="search-sdui-comment-unit"]'
    : '[data-testid="search-sdui-post"]';

  await page.waitForSelector(`${selector}, main`, { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
  if (type === "post") {
    await page.waitForSelector(`${selector} time`, { timeout: 8000 }).catch(() => null);
  }
  await page.waitForFunction(
    (resultSelector) => [...document.querySelectorAll(resultSelector)]
      .some((unit) => /\d/.test(unit.innerText || "")),
    selector,
    { timeout: 8000 }
  ).catch(() => null);

  let stagnantIterations = 0;
  let scrollIterations = 0;
  for (let index = 0; index < 16; index += 1) {
    const count = await page.locator(selector).count();
    if (count >= limit) break;
    const beforeHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const bottomOffset = Math.floor(Math.random() * 250);
    await page.evaluate((offset) => {
      window.scrollTo({
        top: Math.max(0, document.documentElement.scrollHeight - offset),
        behavior: "smooth"
      });
    }, bottomOffset);
    await page.waitForTimeout(300 + Math.floor(Math.random() * 250));
    if (Math.random() < 0.3) {
      await page.mouse.wheel(0, 100 + Math.floor(Math.random() * 150));
      await page.waitForTimeout(80 + Math.floor(Math.random() * 120));
    }
    scrollIterations += 1;
    const afterCount = await page.locator(selector).count();
    const afterHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (afterCount <= count && afterHeight <= beforeHeight) {
      stagnantIterations += 1;
    } else {
      stagnantIterations = 0;
    }
    if (stagnantIterations >= 3) break;
  }

  const pageData = await page.evaluate(({ resultSelector, resultType }) => {
    const cleanText = (value) => {
      const text = value?.textContent?.trim();
      return text || null;
    };
    const fullUrl = (value) => {
      if (!value) return null;
      try {
        return new URL(value, location.origin).href;
      } catch {
        return null;
      }
    };
    const metric = (text, label) => {
      const expression = new RegExp(`([\\d.,]+(?:[KMB])?)\\s+${label}s?`, "i");
      const match = String(text || "").match(expression);
      return match ? `${match[1]} ${label}${match[1] === "1" ? "" : "s"}` : null;
    };
    const pathSegments = (href) => {
      try {
        return new URL(href).pathname.split("/").filter(Boolean);
      } catch {
        return [];
      }
    };

    const records = [...document.querySelectorAll(resultSelector)].map((unit) => {
      const visibleText = unit.innerText?.trim() || "";
      const links = [...unit.querySelectorAll("a")]
        .map((anchor) => ({
          text: anchor.textContent?.trim() || null,
          url: fullUrl(anchor.getAttribute("href"))
        }))
        .filter((link) => link.url);

      if (resultType === "post") {
        const titleLink = unit.querySelector('[data-testid="post-title"]');
        const subredditLink = [...unit.querySelectorAll("a")]
          .find((anchor) => anchor.textContent?.trim().startsWith("r/"));
        const timeNode = unit.querySelector("time");
        const imageNode = unit.querySelector("img");
        let tracking = null;
        try {
          tracking = JSON.parse(unit.getAttribute("data-faceplate-tracking-context") || "null");
        } catch {
          tracking = null;
        }
        const id = tracking?.post?.id || unit.getAttribute("data-thingid") || null;
        const title = cleanText(titleLink) || tracking?.post?.title || null;
        const author = tracking?.profile?.name || null;
        const subreddit = tracking?.subreddit?.name ||
          cleanText(subredditLink)?.replace(/^r\//, "") || null;
        const permalink = fullUrl(titleLink?.getAttribute("href"));
        const publishedAt = timeNode?.getAttribute("datetime") || null;
        const relativeTime = cleanText(timeNode);
        const scoreText = metric(visibleText, "vote");
        const commentCountText = metric(visibleText, "comment");
        const image = imageNode?.currentSrc || imageNode?.src || null;
        const missingFields = [];
        if (!id) missingFields.push("id");
        if (!title) missingFields.push("title");
        if (!author) missingFields.push("author");
        if (!subreddit) missingFields.push("subreddit");
        if (!permalink) missingFields.push("permalink");
        if (!publishedAt) missingFields.push("publishedAt");
        if (!scoreText) missingFields.push("scoreText");
        if (!commentCountText) missingFields.push("commentCountText");

        return {
          id,
          type: "post",
          title,
          body: null,
          author,
          authorUrl: null,
          subreddit,
          subredditUrl: fullUrl(subredditLink?.getAttribute("href")),
          permalink,
          postPermalink: permalink,
          contentUrl: null,
          image,
          publishedAt,
          relativeTime,
          scoreText,
          commentCountText,
          threadScoreText: null,
          threadCommentCountText: null,
          nsfw: tracking?.post?.nsfw ?? null,
          spoiler: tracking?.post?.spoiler ?? null,
          partial: missingFields.length > 0,
          missingFields,
          native: {
            tracking,
            visibleText,
            links
          }
        };
      }

      const anchors = [...unit.querySelectorAll("a")];
      const subredditLink = anchors.find((anchor) => anchor.textContent?.trim().startsWith("r/"));
      const redditLinks = anchors.filter((anchor) => anchor.href.includes("/comments/"));
      const directCommentLink = redditLinks.find((anchor) => pathSegments(anchor.href).length >= 6);
      const threadLink = redditLinks.find((anchor) => {
        const text = anchor.textContent?.trim();
        return pathSegments(anchor.href).length === 5 && text && text !== "Go To Thread";
      }) || redditLinks.find((anchor) => pathSegments(anchor.href).length === 5);
      const authorLink = anchors.find((anchor) => {
        const text = anchor.textContent?.trim();
        return text && anchor.href.endsWith("#") && anchor !== subredditLink;
      });
      const contentNode = unit.querySelector('[data-testid="search-comment-content"]');
      const counterNode = unit.querySelector('[data-testid="search-counter-row"]');
      const timeNode = unit.querySelector("time");
      const contentText = contentNode?.innerText?.trim() || "";
      const scoreText = metric(contentText, "vote");
      const author = cleanText(authorLink);
      let body = contentText
        .replace(/\n[\d.,]+(?:[KMB])?\s+votes?\s*$/i, "")
        .trim() || null;
      const authorPrefix = author ? `${author}\n·` : null;
      if (body && authorPrefix && body.startsWith(authorPrefix)) {
        body = body.slice(authorPrefix.length).trim() || null;
      }
      const directSegments = directCommentLink ? pathSegments(directCommentLink.href) : [];
      const rawId = directSegments.length >= 6 ? directSegments[5] : null;
      const id = rawId ? `t1_${rawId}` : null;
      const title = cleanText(threadLink);
      const subreddit = cleanText(subredditLink)?.replace(/^r\//, "") || null;
      const permalink = fullUrl(directCommentLink?.getAttribute("href"));
      const postPermalink = fullUrl(threadLink?.getAttribute("href"));
      const publishedAt = timeNode?.getAttribute("datetime") || null;
      const relativeTime = cleanText(timeNode);
      const counterText = counterNode?.innerText?.trim() || "";
      const threadScoreText = metric(counterText, "vote");
      const threadCommentCountText = metric(counterText, "comment");
      const missingFields = [];
      if (!id) missingFields.push("id");
      if (!title) missingFields.push("title");
      if (!body) missingFields.push("body");
      if (!author) missingFields.push("author");
      if (!subreddit) missingFields.push("subreddit");
      if (!permalink) missingFields.push("permalink");
      if (!postPermalink) missingFields.push("postPermalink");
      if (!publishedAt) missingFields.push("publishedAt");
      if (!scoreText) missingFields.push("scoreText");

      return {
        id,
        type: "comment",
        title,
        body,
        author,
        authorUrl: null,
        subreddit,
        subredditUrl: fullUrl(subredditLink?.getAttribute("href")),
        permalink,
        postPermalink,
        contentUrl: null,
        image: null,
        publishedAt,
        relativeTime,
        scoreText,
        commentCountText: null,
        threadScoreText,
        threadCommentCountText,
        nsfw: null,
        spoiler: null,
        partial: missingFields.length > 0,
        missingFields,
        native: {
          visibleText,
          links
        }
      };
    });

    const mainText = document.querySelector("main")?.innerText || "";
    const correctionMatch = mainText.match(/Showing results for\s+([^\n]+)/i);
    const explicitEmpty = /no results|did not match any results|couldn[\u0027\u2019]?t find any results|nothing found|没有结果|未找到/i.test(mainText);
    return {
      records,
      mainText: mainText.slice(0, 1200),
      correctedQuery: correctionMatch?.[1]?.trim() || null,
      explicitEmpty
    };
  }, { resultSelector: selector, resultType: type });

  const seen = new Set();
  const deduped = pageData.records.filter((record) => {
    const identity = record.id || record.permalink || JSON.stringify(record.native);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  if (!deduped.length && !pageData.explicitEmpty) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/captcha|challenge|blocked by network security|whoa there|访问受限|安全验证/i.test(bodyText)) {
      throw errorWithCode("ACCESS_RESTRICTED", "Reddit presented an access challenge");
    }
    if (/log in to continue|sign in to continue|登录后继续/i.test(bodyText)) {
      throw errorWithCode("AUTH_REQUIRED", "Reddit requires a browser login for this search");
    }
    throw errorWithCode("DRIFT_DETECTED", "Reddit search result selectors were not found");
  }

  const results = deduped.slice(0, limit);
  const paginationComplete = pageData.explicitEmpty || results.length >= limit;
  const partial = results.some((record) => record.partial) ||
    (!pageData.explicitEmpty && results.length < limit);

  await page.waitForTimeout(Math.floor(Math.random() * 500));

  return {
    results,
    count: results.length,
    query,
    subreddit,
    type,
    sort,
    time,
    limit,
    maxLimit: MAX_LIMIT,
    ignoredParams,
    truncated: false,
    paginationComplete,
    partial,
    relevanceUnknown: Boolean(pageData.correctedQuery),
    correctedQuery: pageData.correctedQuery,
    source: page.url(),
    sourceKind: "reddit-native-dom",
    scrollIterations
  };
};
