export default async (page, params, cwd) => {
  const limitRaw = params.limit ?? "20";
  const sort = params.sort ?? "best";
  const time = params.time ?? "day";

  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const validSorts = ["best", "hot", "top", "rising", "new"];
  if (!validSorts.includes(sort)) {
    const err = new Error(`[INVALID_PARAM] sort must be one of: ${validSorts.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const validTimes = ["hour", "day", "week", "month", "year", "all"];
  if (!validTimes.includes(time)) {
    const err = new Error(`[INVALID_PARAM] time must be one of: ${validTimes.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Build the feed URL. /r/popular/ supports the same sort tabs as the front page.
  let url = `https://www.reddit.com/r/popular/${sort}/`;
  if (sort === "top") {
    url += `?t=${time}`;
  }

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomDelay = (min, max) => page.waitForTimeout(randInt(min, max));

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    const err = new Error("[TIMEOUT] Page navigation timed out");
    err.code = "TIMEOUT";
    throw err;
  }

  // Detect platform rate limiting before waiting for content.
  const blocked = await page.evaluate(() => {
    const text = document.body ? document.body.innerText.toLowerCase() : "";
    return text.includes("blocked by network security") || text.includes("you've been blocked");
  }).catch(() => false);

  if (blocked) {
    const err = new Error("[BLOCKED] Reddit has blocked this request; log in to your Reddit account in the browser and try again");
    err.code = "BLOCKED";
    throw err;
  }

  try {
    await page.waitForSelector("shreddit-post", { timeout: 15000 });
  } catch (e) {
    const err = new Error("[TIMEOUT] Content did not load; Reddit may be blocking or the page structure has drifted");
    err.code = "TIMEOUT";
    throw err;
  }

  // Human-like pause and cursor movement after initial load.
  await randomDelay(300, 1200);
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
    // Optional mouse movement; ignore failures.
  }

  // Reddit /r/popular/ paginates via a "Load more" button (often with a Snoo face icon)
  // instead of pure infinite scroll. We collect unique posts and click the button when needed.
  const allPosts = new Map();
  const maxStagnantRounds = 3;
  const hardMaxLoads = 25;
  let stagnantRounds = 0;

  const extractVisiblePosts = () =>
    page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("shreddit-post"));
      return elements
        .map((el) => ({
          title: el.getAttribute("post-title") || "",
          subreddit: el.getAttribute("subreddit-prefixed-name") || "",
          author: el.getAttribute("author") || "",
          permalink: el.getAttribute("permalink") || "",
          score: el.getAttribute("score") || "0",
          commentCount: el.getAttribute("comment-count") || "0",
          contentHref: el.getAttribute("content-href") || "",
        }))
        .filter((p) => p.subreddit.startsWith("r/") && p.title && p.permalink);
    });

  const clickLoadMore = () =>
    page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('button, [role="button"], faceplate-button, faceplate-tracker'),
      ];
      const btn = candidates.find((el) => {
        const text = (el.textContent || "").toLowerCase();
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        return (
          text.includes("load more") ||
          aria.includes("load more") ||
          text.includes("show more") ||
          aria.includes("show more") ||
          text.includes("view more") ||
          aria.includes("view more")
        );
      });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

  for (let i = 0; i < hardMaxLoads; i++) {
    const batch = await extractVisiblePosts();

    let newCount = 0;
    for (const post of batch) {
      if (!allPosts.has(post.permalink)) {
        allPosts.set(post.permalink, post);
        newCount++;
      }
    }

    if (allPosts.size >= limit) break;

    if (newCount === 0) {
      stagnantRounds++;
      if (stagnantRounds >= maxStagnantRounds) break;
    } else {
      stagnantRounds = 0;
    }

    // Try clicking the "Load more" button first; fall back to a small scroll if no button.
    const clicked = await clickLoadMore();
    if (clicked) {
      await randomDelay(1000, 1800);
    } else {
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
      });
      await randomDelay(800, 1400);
    }

    // Occasional small mouse wiggle during loading.
    if (Math.random() < 0.3) {
      try {
        await page.mouse.move(randInt(50, 400), randInt(100, 500));
      } catch (_) {
        // ignore
      }
    }
  }

  // Build the final ordered result from all collected posts.
  const collected = Array.from(allPosts.values()).slice(0, limit);
  const posts = collected.map((p, idx) => ({
    rank: idx + 1,
    title: p.title,
    subreddit: p.subreddit,
    score: parseInt(p.score, 10),
    num_comments: parseInt(p.commentCount, 10),
    author: p.author,
    permalink: `https://www.reddit.com${p.permalink}`,
    url: p.contentHref || null,
  }));

  // Random 0-2s pause before returning results to keep a polite pacing profile.
  await randomDelay(0, 2000);

  if (posts.length === 0) {
    const err = new Error("[EMPTY_RESULT] No posts found on the page");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return {
    sort,
    time: sort === "top" ? time : undefined,
    limit,
    total: posts.length,
    posts,
  };
};
