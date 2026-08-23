export default async (page, params, cwd) => {
  const limitRaw = params.limit ?? "20";
  const sort = params.sort ?? "best";

  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1) {
    const err = new Error("[INVALID_PARAM] limit must be a positive integer");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const validSorts = ["best", "hot", "top", "rising", "new"];
  if (!validSorts.includes(sort)) {
    const err = new Error(`[INVALID_PARAM] sort must be one of: ${validSorts.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const url = `https://www.reddit.com/${sort}/`;

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector("shreddit-post", { timeout: 15000 });
  } catch (e) {
    const err = new Error("[TIMEOUT] Page navigation or content load timed out");
    err.code = "TIMEOUT";
    throw err;
  }

  // Light human-like pause and cursor movement
  await page.waitForTimeout(randInt(200, 800));
  try {
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    await page.mouse.move(
      randInt(20, Math.max(40, viewport.width - 20)),
      randInt(20, Math.max(40, viewport.height - 20))
    );
  } catch (_) {
    // ignore optional mouse movement errors
  }

  // Scroll to load more posts (Reddit lazy-loads content).
  // Continue scrolling while post count is growing and we haven't reached the limit.
  const maxStagnantRounds = 3;
  const hardMaxScrolls = 50;
  let stagnantRounds = 0;
  let lastCount = 0;

  for (let i = 0; i < hardMaxScrolls; i++) {
    const visibleCount = await page.evaluate(() =>
      document.querySelectorAll("shreddit-post").length
    );

    if (visibleCount >= limit) break;

    if (visibleCount === lastCount) {
      stagnantRounds++;
      if (stagnantRounds >= maxStagnantRounds) break;
    } else {
      stagnantRounds = 0;
    }
    lastCount = visibleCount;

    await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight * 2, behavior: "smooth" });
    });
    await page.waitForTimeout(randInt(900, 1400));
  }

  // Let any late-arriving posts settle
  await page.waitForTimeout(randInt(0, 3000));

  const posts = await page.evaluate((maxPosts) => {
    const elements = Array.from(document.querySelectorAll("shreddit-post"));
    const results = [];
    for (const el of elements) {
      if (results.length >= maxPosts) break;

      const subreddit = el.getAttribute("subreddit-prefixed-name") || "";
      if (!subreddit.startsWith("r/")) continue;

      const title = el.getAttribute("post-title") || "";
      if (!title) continue;

      const scoreRaw = el.getAttribute("score") || "0";
      const commentsRaw = el.getAttribute("comment-count") || "0";
      const permalink = el.getAttribute("permalink") || "";
      const contentHref = el.getAttribute("content-href") || "";
      const author = el.getAttribute("author") || "";
      const score = parseInt(scoreRaw, 10);
      const numComments = parseInt(commentsRaw, 10);

      results.push({
        rank: results.length + 1,
        title,
        subreddit,
        score,
        num_comments: numComments,
        author,
        permalink: permalink ? `https://www.reddit.com${permalink}` : null,
        url: contentHref || null,
      });
    }
    return results;
  }, limit);

  if (posts.length === 0) {
    const err = new Error("[EMPTY_RESULT] No posts found on the page");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return {
    sort,
    limit,
    total: posts.length,
    posts,
  };
};
