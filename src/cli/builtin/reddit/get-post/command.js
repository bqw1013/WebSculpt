function buildCommentTree(flatComments, maxDepth, limit) {
  // 1. Optional depth filter.
  let nodes = flatComments;
  if (maxDepth > 0) {
    nodes = nodes.filter((c) => c.depth <= maxDepth);
  }

  // 2. Build tree from parentId (document order is pre-order, parents appear before children).
  const nodeMap = new Map();
  const roots = [];

  for (const node of nodes) {
    node.children = [];
    nodeMap.set(node.id, node);
  }

  for (const node of nodes) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 3. Optional limit via pre-order truncation.
  if (limit > 0) {
    let count = 0;

    function preOrderInclude(list) {
      const result = [];
      for (const node of list) {
        if (count >= limit) break;
        count++;
        const filteredChildren = preOrderInclude(node.children);
        node.children = filteredChildren;
        result.push(node);
      }
      return result;
    }

    return preOrderInclude(roots);
  }

  return roots;
}

function countTreeNodes(roots) {
  let count = 0;
  for (const node of roots) {
    count += 1 + countTreeNodes(node.children);
  }
  return count;
}

export default async (page, params, cwd) => {
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const permalinkRaw = (params.permalink || "").trim();
  if (!permalinkRaw) {
    const err = new Error("[MISSING_PARAM] permalink is required");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const sort = params.sort || "best";
  const validSorts = ["best", "top", "new", "controversial", "qa"];
  if (!validSorts.includes(sort)) {
    const err = new Error(`[INVALID_PARAM] sort must be one of: ${validSorts.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const limit = parseInt(params.limit || "0", 10);
  if (isNaN(limit) || limit < 0) {
    const err = new Error("[INVALID_PARAM] limit must be a non-negative integer");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const depth = parseInt(params.depth || "0", 10);
  if (isNaN(depth) || depth < 0) {
    const err = new Error("[INVALID_PARAM] depth must be a non-negative integer");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const includeComments = params.include_comments !== "false";

  let targetUrl;
  try {
    if (/^https?:\/\//i.test(permalinkRaw)) {
      targetUrl = new URL(permalinkRaw);
    } else {
      // Git Bash on Windows may turn a leading /r/ into R:/; normalize it back.
      let path = permalinkRaw.startsWith("/") ? permalinkRaw : `/${permalinkRaw}`;
      path = path.replace(/^\/([a-zA-Z]):\//, (match, letter) => `/${letter.toLowerCase()}/`);
      targetUrl = new URL(`https://www.reddit.com${path}`);
    }
    targetUrl.searchParams.set("sort", sort);
  } catch (_) {
    const err = new Error("[INVALID_PARAM] permalink must be a full Reddit URL or a Reddit path starting with /r/");
    err.code = "INVALID_PARAM";
    throw err;
  }

  try {
    await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (e) {
    const err = new Error("[TIMEOUT] Page navigation timed out");
    err.code = "TIMEOUT";
    throw err;
  }

  // Check for platform rate limiting before waiting for content.
  const isBlocked = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : "";
    const title = document.title || "";
    return /you\s*'?ve been blocked by network security/i.test(text) ||
           /blocked by network security/i.test(title);
  });

  if (isBlocked) {
    const err = new Error("[BLOCKED] Reddit returned a network security block; please retry later");
    err.code = "BLOCKED";
    throw err;
  }

  try {
    await page.waitForSelector("shreddit-post", { timeout: 20000 });
  } catch (e) {
    const stillBlocked = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : "";
      return /you\s*'?ve been blocked by network security/i.test(text);
    });
    if (stillBlocked) {
      const err = new Error("[BLOCKED] Reddit returned a network security block; please retry later");
      err.code = "BLOCKED";
      throw err;
    }
    const err = new Error("[DRIFT_DETECTED] Reddit post structure changed or post not found");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  // Lightweight human-like pause and occasional small cursor movement.
  await page.waitForTimeout(randInt(200, 500));
  try {
    if (Math.random() < 0.5) {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      await page.mouse.move(
        randInt(Math.max(0, centerX - 80), centerX + 80),
        randInt(Math.max(0, centerY - 80), centerY + 80)
      );
    }
  } catch (_) {
    // ignore optional mouse movement errors
  }

  const post = await page.evaluate(() => {
    const el = document.querySelector("shreddit-post");
    if (!el) return null;
    const bodyEl = el.querySelector('[slot="text-body"]');
    return {
      id: el.getAttribute("id") || null,
      title: el.getAttribute("post-title") || "",
      author: el.getAttribute("author") || "",
      subreddit: el.getAttribute("subreddit-prefixed-name") || "",
      score: parseInt(el.getAttribute("score") || "0", 10),
      commentCount: parseInt(el.getAttribute("comment-count") || "0", 10),
      upvoteRatio: parseFloat(el.getAttribute("upvote-ratio") || "0"),
      type: el.getAttribute("post-type") || "",
      url: el.getAttribute("content-href") || location.href,
      body: bodyEl ? bodyEl.innerText : null,
      created: el.getAttribute("created-timestamp") || null,
      permalink: el.getAttribute("permalink") || "",
    };
  });

  if (!post) {
    const err = new Error("[DRIFT_DETECTED] Could not extract post data");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  let totalComments = post.commentCount;
  let comments = [];

  if (includeComments && totalComments > 0) {
    try {
      await page.waitForSelector("shreddit-comment-tree", { timeout: 10000 });
    } catch (_) {
      // tree may be missing for posts with 0 comments; continue with empty list
    }

    const treeTotal = await page.evaluate(() => {
      const tree = document.querySelector("shreddit-comment-tree");
      return tree ? parseInt(tree.getAttribute("totalcomments") || "0", 10) : 0;
    });
    if (treeTotal > 0) totalComments = treeTotal;

    // Lazy-load more comments until we have enough for the requested limit.
    const initialCommentCount = await page.evaluate(
      () => document.querySelectorAll("shreddit-comment").length
    );
    if (limit === 0 || initialCommentCount < limit) {
      const maxScrolls = 15;
      const maxStagnant = 3;
      let stagnant = 0;
      let lastCount = initialCommentCount;

      for (let i = 0; i < maxScrolls; i++) {
        const currentCount = await page.evaluate(() =>
          document.querySelectorAll("shreddit-comment").length
        );

        if (limit > 0 && currentCount >= limit) break;
        if (currentCount === lastCount) {
          stagnant++;
          if (stagnant >= maxStagnant) break;
        } else {
          stagnant = 0;
        }
        lastCount = currentCount;

        await page.evaluate(() => {
          window.scrollBy({ top: window.innerHeight * 2, behavior: "smooth" });
        });
        await page.waitForTimeout(randInt(300, 800));
      }
    }

    const rawComments = await page.evaluate(() =>
      Array.from(document.querySelectorAll("shreddit-comment")).map((c) => {
        const bodyEl = c.querySelector('[slot="comment"]');
        return {
          id: c.getAttribute("thingid") || null,
          author: c.getAttribute("author") || "",
          score: parseInt(c.getAttribute("score") || "0", 10),
          depth: parseInt(c.getAttribute("depth") || "0", 10),
          parentId: c.getAttribute("parentid") || null,
          permalink: c.getAttribute("permalink") || "",
          created: c.getAttribute("created") || null,
          body: bodyEl ? bodyEl.innerText : "",
          collapsed: c.hasAttribute("collapsed"),
        };
      })
    );

    comments = buildCommentTree(rawComments, depth, limit);
  }

  // Final random wait before returning (0-500ms).
  await page.waitForTimeout(randInt(0, 500));

  return {
    post,
    comments,
    totalComments,
    returnedComments: countTreeNodes(comments),
    sort,
  };
};
