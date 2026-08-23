// quora/get-question - browser runtime
// Extracts a Quora question page: metadata, answer cards, and optional related questions.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wait for a random short interval to mimic human pacing.
async function randomWait(min = 600, max = 1400) {
  await sleep(min + Math.floor(Math.random() * (max - min)));
}

// Move the mouse to a random viewport position.
async function randomMouseMove(page) {
  try {
    const x = 80 + Math.floor(Math.random() * 400);
    const y = 120 + Math.floor(Math.random() * 300);
    await page.mouse.move(x, y);
  } catch {
    // Ignore mouse-move errors (e.g. viewport not ready).
  }
}

// Scroll one viewport down with a small random horizontal wiggle.
async function humanScroll(page) {
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  await randomMouseMove(page);
  await randomWait(800, 1600);
}

// Extract the answer count from visible page text.
async function extractAnswerCount(page) {
  return page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText : "";
    const m =
      bodyText.match(/Answers?\s*\((\d+(?:,\d+)*)\)/i) ||
      bodyText.match(/(\d+(?:,\d+)*)\s+Answers?\b(?!\s+(?:collapsed|hidden))/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  });
}

// Build a canonical Quora question URL from either a full URL or a slug.
function buildUrl(input) {
  const raw = (input || "").trim();
  if (!raw) {
    const err = new Error("[MISSING_PARAM] --url is required");
    err.code = "MISSING_PARAM";
    throw err;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.split(/[?#]/)[0];
  }
  return `https://www.quora.com/${raw.replace(/^\/+/, "").replace(/\/+$/,"")}`;
}

// Parse the question slug from a Quora URL pathname.
function getSlugFromUrl(urlString) {
  try {
    const pathname = new URL(urlString).pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] || "";
  } catch {
    return "";
  }
}

// Throw a structured business error.
function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

export default async (page, params, cwd) => {
  // ---------------------------
  // Parameter parsing & validation
  // ---------------------------
  const targetUrl = buildUrl(params.url);
  const questionSlug = getSlugFromUrl(targetUrl);

  const limitRaw = params.limit ? parseInt(params.limit, 10) : 20;
  if (Number.isNaN(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throwError("INVALID_PARAM", "--limit must be an integer between 1 and 100");
  }
  const limit = limitRaw;

  const sort = (params.sort || "recommended").toLowerCase();
  if (!["recommended", "recent"].includes(sort)) {
    throwError("INVALID_PARAM", "--sort must be 'recommended' or 'recent'");
  }

  const includeRelated = params.include_related === "true";

  // ---------------------------
  // Navigation
  // ---------------------------
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await randomWait(600, 1200);

  // Detect 404 / login wall before relying on content selectors.
  const pageStatus = await page.evaluate(() => {
    const title = document.title;
    const bodyText = document.body ? document.body.innerText : "";
    return {
      title,
      bodyText: bodyText.slice(0, 600),
      hasH1: !!document.querySelector("h1"),
    };
  });

  if (pageStatus.title.includes("Error") || /Page Not Found/i.test(pageStatus.bodyText)) {
    throwError("NOT_FOUND", `Question page not found: ${targetUrl}`);
  }
  const loginSignals = /sign\s*in|log\s*in|join\s*quora|continue\s*with|login/i;
  if (
    !pageStatus.hasH1 &&
    (loginSignals.test(pageStatus.bodyText) || loginSignals.test(pageStatus.title))
  ) {
    throwError("AUTH_REQUIRED", "Quora requires login to view this question");
  }

  // Wait for the main question container to render.
  // Use h1 (stable across question pages) and the answer stream header.
  // Some pages expose the answer stream a little later, so we give it a
  // short grace period before continuing with whatever is available.
  try {
    await page.waitForSelector("h1", { timeout: 10000 });
  } catch {
    throwError("DRIFT_DETECTED", "Expected question title (h1) not found");
  }
  await page
    .waitForSelector(".spacing_log_answer_header", { timeout: 8000 })
    .catch(() => {
      // The question may have no answers; keep going and let extraction
      // return an empty list.
    });

  // ---------------------------
  // Sort handling
  // ---------------------------
  const currentSortLabel = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("div, span, button")).find(
      (e) => /^Sort(Recent|Recommended)$/.test(e.innerText.trim())
    );
    return el ? el.innerText.trim().replace(/^Sort/, "").toLowerCase() : "recommended";
  });

  if (currentSortLabel !== sort) {
    const currentFull = `Sort${currentSortLabel === "recent" ? "Recent" : "Recommended"}`;
    const targetOption = sort === "recent" ? "Recent" : "Recommended";
    try {
      await page.getByText(currentFull).click();
      await randomWait(400, 800);
      await page.getByText(targetOption).click();
      await randomWait(1000, 1800);
      // Wait until the label flips to the requested sort.
      await page.waitForFunction(
        (expected) => {
          const text = `Sort${expected === "recent" ? "Recent" : "Recommended"}`;
          return Array.from(document.querySelectorAll("div, span, button")).some(
            (e) => e.innerText.trim() === text
          );
        },
        sort,
        { timeout: 10000 }
      );
    } catch {
      // Non-fatal: continue with whatever sort is active.
    }
  }

  // ---------------------------
  // Read answer count (may require opening the "All related" tab)
  // ---------------------------
  let answerCount = await extractAnswerCount(page);
  if (answerCount == null) {
    try {
      await page.getByText(/All related/i).first().click();
      await randomWait(1000, 1600);
      answerCount = await extractAnswerCount(page);
      // Restore the answer list view when possible.
      try {
        await page.getByText(/Answers \(\d+\)/i).first().click();
        await randomWait(800, 1200);
      } catch {
        // Non-fatal: the page may not have a restore tab.
      }
    } catch {
      // Non-fatal: answer count stays null.
    }
  }

  // ---------------------------
  // Scroll until we have enough answer cards
  // ---------------------------
  let previousCount = 0;
  let stallCount = 0;
  while (true) {
    const count = await page.evaluate(() =>
      document.querySelectorAll(".spacing_log_answer_header").length
    );
    if (count >= limit) break;
    if (count === previousCount) {
      stallCount += 1;
      if (stallCount >= 2) break;
    } else {
      stallCount = 0;
    }
    previousCount = count;
    await humanScroll(page);
  }

  // ---------------------------
  // Extract question metadata
  // ---------------------------
  const metadata = await page.evaluate(() => {
    const titleEl = document.querySelector("h1");
    const title = titleEl ? titleEl.innerText.trim() : "";

    const topicEls = Array.from(document.querySelectorAll('a[href*="/topic/"]'));
    const topics = [];
    const seen = new Set();
    topicEls.forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href || seen.has(href)) return;
      seen.add(href);
      const m = href.match(/topic\/([^/?#]+)/);
      topics.push({
        name: a.innerText.trim(),
        slug: m ? decodeURIComponent(m[1]) : "",
        url: href.startsWith("http") ? href : `https://www.quora.com${href}`,
      });
    });

    return { title, topics };
  });

  // ---------------------------
  // Extract answer cards
  // ---------------------------
  const answers = await page.evaluate((max) => {
    const headers = Array.from(document.querySelectorAll(".spacing_log_answer_header"));
    const contents = Array.from(document.querySelectorAll(".puppeteer_test_answer_content"));
    const upvoteEls = Array.from(document.querySelectorAll(".dom_annotate_answer_action_bar_upvote"));
    const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

    function isBetween(node, start, end) {
      const afterStart = start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (!afterStart) return false;
      if (!end) return true;
      const beforeEnd = node.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING;
      return beforeEnd;
    }

    function firstBetween(elements, start, end) {
      for (const el of elements) {
        if (isBetween(el, start, end)) return el;
      }
      return null;
    }

    function allBetween(elements, start, end) {
      return elements.filter((el) => isBetween(el, start, end));
    }

    const results = [];
    for (let i = 0; i < headers.length && results.length < max; i++) {
      const header = headers[i];
      const nextHeader = headers[i + 1] || null;

      const profileLink = header.querySelector('a[href*="/profile/"]');
      const answerLink = header.querySelector('a[href*="/answer/"]');
      if (!profileLink || !answerLink) continue;

      const headerText = header.innerText.trim();
      const parts = headerText.split("·").map((s) => s.trim());
      // The author display name is the first segment of the header text.
      const name = parts[0] || profileLink.innerText.trim();
      let credential = "";
      let publishedAt = "";
      if (parts.length >= 3) {
        credential = parts[1].replace(/^Follow\s*/, "").trim();
        publishedAt = parts[parts.length - 1];
      } else if (parts.length === 2) {
        publishedAt = parts[1];
      }

      const contentEl = firstBetween(contents, header, nextHeader);
      const excerpt = contentEl ? contentEl.innerText.trim() : "";

      const upvoteEl = firstBetween(upvoteEls, header, nextHeader);
      let upvoteCount = null;
      if (upvoteEl) {
        const m = upvoteEl.innerText.trim().match(/Upvote\s*(\d+(?:,\d+)*)/i);
        if (m) upvoteCount = parseInt(m[1].replace(/,/g, ""), 10);
      }

      const buttons = allBetween(allButtons, header, nextHeader);
      let commentCount = null;
      for (const btn of buttons) {
        const aria = btn.getAttribute("aria-label") || "";
        const cm = aria.match(/(\d+(?:,\d+)*)\s*comments?/i);
        if (cm) {
          commentCount = parseInt(cm[1].replace(/,/g, ""), 10);
          break;
        }
      }
      // If a comments button exists but has no number, the count is 0.
      if (commentCount === null && buttons.some((b) => /comments?/i.test(b.getAttribute("aria-label") || ""))) {
        commentCount = 0;
      }

      results.push({
        author: {
          name,
          profileUrl: profileLink.getAttribute("href"),
          credential: credential || null,
        },
        url: answerLink.getAttribute("href"),
        publishedAt,
        upvoteCount,
        commentCount,
        excerpt,
        isTruncated: excerpt.includes("(more)"),
      });
    }
    return results;
  }, limit);

  // Mark merged-source answers by comparing slugs.
  const pageHost = new URL(targetUrl).origin;
  for (const ans of answers) {
    try {
      const ansSlug = getSlugFromUrl(ans.url);
      if (ansSlug && ansSlug !== questionSlug) {
        ans.isMergedSource = true;
        ans.mergedFromQuestion = {
          title: null,
          url: `${pageHost}/${ansSlug}`,
        };
      }
    } catch {
      // ignore
    }
  }

  // ---------------------------
  // Optional related questions
  // ---------------------------
  let related = [];
  if (includeRelated) {
    try {
      await page.getByText(/All related/i).first().click();
      await randomWait(1000, 1800);

      related = await page.evaluate(() => {
        const titles = Array.from(document.querySelectorAll(".puppeteer_test_question_title"));
        const seen = new Set();
        const out = [];
        for (const t of titles) {
          const a = t.closest("a");
          if (!a) continue;
          const href = a.getAttribute("href") || "";
          if (!href || href.includes("/notifications")) continue;
          const key = href.split("?")[0];
          if (seen.has(key)) continue;
          seen.add(key);
          let url = href;
          if (!url.startsWith("http")) url = `https://www.quora.com${url}`;
          let answerCount = null;
          if (/\/unanswered\//.test(href)) answerCount = 0;
          out.push({
            title: t.innerText.trim(),
            url,
            answerCount,
          });
        }
        return out;
      });
    } catch {
      related = [];
    }
  }

  const finalUrl = page.url().split(/[?#]/)[0];

  const result = {
    question: {
      title: metadata.title,
      url: finalUrl,
      topics: metadata.topics,
      answerCount,
      followerCount: null,
    },
    answers,
    partial: answers.length < limit,
  };

  if (includeRelated) {
    result.related = related;
  }

  return result;
};
