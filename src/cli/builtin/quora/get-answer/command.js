// quora/get-answer - fetch a single Quora answer page
// Runtime: browser
// Implements random waits, small mouse movements and scrolling to keep polite pacing.

function parseMetric(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const cleaned = value.trim().replace(/,/g, "");
  const match = cleaned.match(/^([\d.]+)([KMB]?)$/i);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  const multiplier = { "": 1, K: 1_000, M: 1_000_000, B: 1_000_000_000 }[suffix] || 1;
  return Math.round(num * multiplier);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanPause(page, min = 300, max = 900) {
  await page.waitForTimeout(randomInt(min, max));
}

async function humanScroll(page) {
  const dy = randomInt(200, 600);
  await page.mouse.wheel(0, dy);
  await humanPause(page, 300, 700);
}

async function humanMove(page) {
  const x = randomInt(100, 600);
  const y = randomInt(100, 500);
  await page.mouse.move(x, y);
  await humanPause(page, 100, 300);
}

async function safeGoto(page, url) {
  // First navigation attempt with a light wait strategy.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await humanPause(page, 500, 1_200);
  await humanMove(page);

  // Wait for the main content container; if missing, try one reload.
  try {
    await page.waitForSelector("#mainContent", { timeout: 8_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await humanPause(page, 800, 1_500);
    await page.waitForSelector("#mainContent", { timeout: 10_000 });
  }
}

async function detectErrorState(page) {
  const state = await page.evaluate(() => {
    const title = document.title;
    const bodyText = document.body ? document.body.innerText : "";
    const main = document.getElementById("mainContent");
    return {
      title,
      hasPageNotFound: bodyText.includes("Page Not Found"),
      hasErrorTitle: title.includes("Error"),
      hasMainContent: !!main,
    };
  });

  // Hard 404: question slug does not exist.
  if (state.hasPageNotFound || (state.hasErrorTitle && !state.hasMainContent)) {
    const err = new Error("[NOT_FOUND] The requested answer page does not exist");
    err.code = "NOT_FOUND";
    throw err;
  }
}

async function extractAnswer(page, includeHtml) {
  return page.evaluate((includeHtmlArg) => {
    const main = document.getElementById("mainContent");
    if (!main) return { error: "MAIN_CONTENT_MISSING" };

    const textOf = (el) => (el ? el.innerText.trim() : "");

    // 1. Question title
    let questionTitle = "";
    let questionUrl = "";
    const qContainer = main.querySelector(".q-box.qu-mb--medium.qu-mt--small");
    if (qContainer) {
      const qLink = qContainer.querySelector("a");
      questionTitle = textOf(qLink);
      questionUrl = qLink ? qLink.href : "";
    }
    // Fallback for Space subdomain pages where the title container differs.
    if (!questionTitle) {
      const h1 = document.querySelector("h1");
      if (h1) questionTitle = textOf(h1);
    }
    if (!questionUrl) {
      try {
        const path = location.pathname.replace(/-?\d+$/, "").replace(/-/g, " ");
        questionTitle = questionTitle || path.replace(/^\//, "").trim();
        questionUrl = location.href;
      } catch {
        // ignore
      }
    }

    // 2. Answer body: largest q-text with paragraphs
    const contentCandidates = Array.from(main.querySelectorAll("div.q-text")).filter(
      (el) => el.querySelector("p") && el.innerText.trim().length > 80
    );
    contentCandidates.sort((a, b) => b.innerText.length - a.innerText.length);
    const contentEl = contentCandidates[0];
    const fullText = contentEl ? contentEl.innerText.trim() : "";
    const fullHtml = includeHtmlArg && contentEl ? contentEl.outerHTML : undefined;

    if (!fullText) {
      return { error: "ANSWER_CONTENT_MISSING" };
    }

    // 3. Author block: find a profile link whose nearest ancestor block contains a date line.
    let authorName = "";
    let authorUrl = "";
    let credential = "";
    let publishedAt = "";

    const profileLinks = Array.from(main.querySelectorAll('a[href*="/profile/"]'));
    const authorLink = profileLinks.find((a) => {
      let node = a.closest(".q-box");
      while (node && node !== main) {
        const t = node.innerText || "";
        if (/\n\s*·\s*\d+[ymwdh]\s*$/.test(t) || /Upvoted by[\s\S]*\d+[ymwdh]\s*$/.test(t)) {
          return true;
        }
        node = node.parentElement && node.parentElement.closest(".q-box");
      }
      return false;
    });

    if (authorLink) {
      authorUrl = authorLink.href;
      let block = authorLink.closest(".q-box");
      while (block && block !== main) {
        const t = block.innerText || "";
        if (/\n\s*·\s*\d+[ymwdh]\s*$/.test(t) || /Upvoted by[\s\S]*\d+[ymwdh]\s*$/.test(t)) break;
        block = block.parentElement && block.parentElement.closest(".q-box");
      }
      if (block) {
        const lines = block.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        authorName = lines[0] || "";
        const dateLine = lines.find((l) => /\d+[ymwdh]\s*$/.test(l));
        if (dateLine) {
          const m = dateLine.match(/(?:·\s*)?(\d+[ymwdh])\s*$/);
          publishedAt = m ? m[1] : "";
        }
        // Credential is the line between name and the date/upvoted line, excluding "Upvoted by"
        const upvotedIdx = lines.findIndex((l) => l.startsWith("Upvoted by"));
        let credIdx = -1;
        if (upvotedIdx > 0) {
          credIdx = 1;
        } else {
          credIdx = lines.findIndex((l, i) => i > 0 && l !== dateLine && !/\d+[ymwdh]$/.test(l));
        }
        if (credIdx > 0 && lines[credIdx] !== dateLine) {
          credential = lines[credIdx].split("Upvoted by")[0].trim();
        }
      }
    }

    // 4. Metrics as raw strings; parsed in Node.
    const bodyText = main.innerText;
    let upvoteText;
    let commentText;
    let shareText;
    let viewText;

    const upvoteBtn = bodyText.match(/Upvote\s*\n?([\d.]+[KMB]?)/i);
    if (upvoteBtn) upvoteText = upvoteBtn[1];

    const viewMatch = bodyText.match(/([\d.]+[KMB]?)\s+views?/i);
    if (viewMatch) viewText = viewMatch[0];

    const shareMatch = bodyText.match(/View\s+([\d.]+[KMB]?)\s+shares?/i);
    if (shareMatch) shareText = shareMatch[1];

    // Comment count appears as the standalone number right after the upvote count.
    const metricsMatch = bodyText.match(/Upvote\s*\n?([\d.]+[KMB]?)\s*\n?(\d+)\s*\n?(\d+)?/i);
    if (metricsMatch) {
      commentText = metricsMatch[2];
      if (metricsMatch[3]) shareText = metricsMatch[3];
    }
    // Fallback for comments-disabled pages where no standalone number exists.
    if (commentText === undefined && bodyText.includes("Comments")) {
      const cm = bodyText.match(/Comments\s*\n?(\d+)/i);
      if (cm) commentText = cm[1];
    }

    return {
      question: { title: questionTitle, url: questionUrl },
      author: { name: authorName, profileUrl: authorUrl, credential: credential || undefined },
      publishedAt: publishedAt || undefined,
      upvoteText,
      commentText,
      shareText,
      viewText,
      fullText,
      fullHtml,
    };
  }, includeHtml);
}

async function extractAboutAuthor(page) {
  return page.evaluate(() => {
    const main = document.getElementById("mainContent");
    if (!main) return {};
    const candidates = Array.from(main.querySelectorAll("div")).filter((el) => {
      const t = el.innerText || "";
      return t.includes("About the Author") && /\d+[KMB]?\s+content views/.test(t);
    });
    candidates.sort((a, b) => a.innerText.length - b.innerText.length);
    const card = candidates[0];
    if (!card) return {};
    const text = card.innerText;
    const result = {};
    // Fallback author name from the About the Author card.
    const nameLine = text.match(/About the Author\s*\n\s*([^\n]+)/);
    if (nameLine) result.authorName = nameLine[1].trim();
    const cv = text.match(/([\d.]+[KMB]?)\s+content views/i);
    if (cv) result.contentViews = cv[0];
    const mv = text.match(/([\d.]+[KMB]?)\s+this month/i);
    if (mv) result.monthlyViews = mv[0];
    const spaces = text.match(/Active in\s+(\d+)\s+Spaces/i);
    if (spaces) result.activeSpaces = parseInt(spaces[1], 10);
    const joined = text.match(/Joined\s+([A-Za-z]+\s+\d{4})/i);
    if (joined) result.joined = joined[0];
    const followers = text.match(/Follow\s*·\s*([\d.]+[KMB]?)/i);
    if (followers) result.followerCountText = followers[1];
    return result;
  });
}

async function loadMoreComments(page, desiredCount) {
  // Scroll until the comments section is likely in view, then repeatedly click "View more comments".
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
  await humanPause(page, 500, 900);

  function countCommentsInRoot() {
    const main = document.getElementById("mainContent");
    if (!main) return 0;
    const candidates = Array.from(main.querySelectorAll("div")).filter((el) => {
      const t = el.innerText || "";
      return (
        t.includes("Comments") &&
        t.includes("Recommended") &&
        t.includes("Reply")
      );
    });
    candidates.sort((a, b) => a.innerText.length - b.innerText.length);
    const root = candidates[0];
    return root ? root.querySelectorAll('a[href*="/profile/"]').length : 0;
  }

  let clicks = 0;
  while (clicks < 20) {
    const hasButton = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.innerText.trim() === "View more comments"
      );
      return !!btn;
    });
    if (!hasButton) break;

    const countBefore = await page.evaluate(countCommentsInRoot);

    await page.click('button:has-text("View more comments")');
    await humanPause(page, 800, 1_500);
    await humanScroll(page);

    const countAfter = await page.evaluate(countCommentsInRoot);

    clicks += 1;
    if (countAfter === countBefore && countAfter > desiredCount) break;
  }
}

async function extractComments(page, limit) {
  return page.evaluate((limitArg) => {
    // Recursively parse the comments tree.
    function getCommentsRoot() {
      const main = document.getElementById("mainContent");
      if (!main) return null;
      const candidates = Array.from(main.querySelectorAll("div")).filter((el) => {
        const t = el.innerText || "";
        return (
          t.includes("Comments") &&
          t.includes("Recommended") &&
          t.includes("Reply")
        );
      });
      candidates.sort((a, b) => a.innerText.length - b.innerText.length);
      return candidates[0] || null;
    }

    function isCommentNode(el) {
      const t = el.innerText.trim();
      return (
        /^[^\n]+\n\s*·\s*\d+[ymwdh]\s*\n/.test(t) &&
        /Reply/.test(t)
      );
    }

    const root = getCommentsRoot();
    if (!root) return { comments: [], partial: false };

    const all = Array.from(root.querySelectorAll("div.q-box")).filter(isCommentNode);
    // Quora nests comment content inside several wrapper divs that share the same text.
    // Keep only the innermost node for each distinct (author + text) comment.
    const nodes = all.filter((el) => {
      const text = el.innerText.trim();
      return !all.some(
        (other) => other !== el && el.contains(other) && other.innerText.trim() === text
      );
    });

    // Determine nesting by walking up to the nearest comment ancestor.
    nodes.forEach((el) => {
      el._parent = null;
      let p = el.parentElement;
      while (p && p !== root) {
        if (nodes.includes(p)) {
          el._parent = p;
          break;
        }
        p = p.parentElement;
      }
    });

    function parseNode(el) {
      const text = el.innerText.trim();
      const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
      const author = lines[0] || "";
      const timeLine = lines.find((l) => /·\s*\d+[ymwdh]/.test(l));
      const publishedAt = timeLine ? timeLine.replace(/.*·\s*/, "").trim() : "";
      const timeIdx = lines.indexOf(timeLine);
      // The first "Reply" after the time line belongs to this comment.
      let replyIdx = -1;
      for (let i = timeIdx + 1; i < lines.length; i++) {
        if (lines[i] === "Reply" || lines[i].endsWith(" Reply")) {
          replyIdx = i;
          break;
        }
      }
      let bodyLines = [];
      if (timeIdx >= 0 && replyIdx > timeIdx) {
        bodyLines = lines.slice(timeIdx + 1, replyIdx);
      }
      // Remove a trailing standalone upvote number line before Reply.
      let upvoteCount;
      if (bodyLines.length > 0 && /^\d+$/.test(bodyLines[bodyLines.length - 1])) {
        upvoteCount = parseInt(bodyLines.pop(), 10);
      }
      const body = bodyLines.join("\n").trim();
      const authorLink = el.querySelector('a[href*="/profile/"]');
      const rawReplies = nodes.filter((c) => c._parent === el).map(parseNode);
      // Quora's nested DOM can render the same comment text in wrapper/placeholder nodes.
      // Drop replies that are identical to this comment or to an earlier sibling.
      const seen = new Set([`${author}|${body}|${publishedAt}`]);
      const replies = [];
      for (const r of rawReplies) {
        const key = `${r.author.name}|${r.text}|${r.publishedAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        replies.push(r);
      }
      return {
        author: { name: author, profileUrl: authorLink ? authorLink.href : null },
        text: body,
        publishedAt,
        upvoteCount,
        isReply: !!el._parent,
        replies: replies.length ? replies : undefined,
      };
    }

    const top = nodes.filter((c) => !c._parent);
    const comments = top.map(parseNode);

    // Flat-limit top-level comments to the requested number. Nested replies remain attached.
    const limited = comments.slice(0, limitArg);
    const partial = comments.length > limited.length;
    return { comments: limited, partial };
  }, limit);
}

export default async function (page, params, cwd) {
  const url = params.url;
  if (!url || !url.trim()) {
    const err = new Error("[MISSING_PARAM] --url is required");
    err.code = "MISSING_PARAM";
    throw err;
  }
  if (!url.includes("quora.com")) {
    const err = new Error("[INVALID_PARAM] --url must be a Quora answer URL");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const includeComments = params.include_comments === "true";
  const commentLimit = parseInt(params.comment_limit, 10);
  if (Number.isNaN(commentLimit) || commentLimit < 1 || commentLimit > 100) {
    const err = new Error("[INVALID_PARAM] --comment_limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const includeHtml = params.include_html === "true";

  await humanMove(page);
  await safeGoto(page, url);
  await humanMove(page);
  await humanScroll(page);

  // Detect Quora silently redirecting an invalid author slug to the question page.
  const finalUrl = page.url();
  if (/\/answer\//.test(url) && !/\/answer\//.test(finalUrl)) {
    const err = new Error("[NOT_FOUND] Answer not found; Quora redirected to the question page");
    err.code = "NOT_FOUND";
    throw err;
  }

  await detectErrorState(page);

  const raw = await extractAnswer(page, includeHtml);
  if (raw.error) {
    // If the answer body is missing, likely redirected to the question page (author not found).
    const err = new Error(`[NOT_FOUND] Could not locate answer content (${raw.error})`);
    err.code = "NOT_FOUND";
    throw err;
  }

  const answer = {
    url: page.url(),
    question: raw.question,
    author: raw.author,
    publishedAt: raw.publishedAt,
    fullText: raw.fullText,
    fullHtml: raw.fullHtml,
  };

  if (raw.upvoteText !== undefined) answer.upvoteCount = parseMetric(raw.upvoteText);
  if (raw.commentText !== undefined) answer.commentCount = parseInt(raw.commentText, 10);
  if (raw.shareText !== undefined) answer.shareCount = parseMetric(raw.shareText);
  if (raw.viewText !== undefined) answer.viewCount = raw.viewText;

  const aboutAuthor = await extractAboutAuthor(page);
  if (!answer.author.name && aboutAuthor.authorName) answer.author.name = aboutAuthor.authorName;
  if (aboutAuthor.contentViews) answer.author.contentViews = aboutAuthor.contentViews;
  if (aboutAuthor.monthlyViews) answer.author.monthlyViews = aboutAuthor.monthlyViews;
  if (aboutAuthor.activeSpaces !== undefined) answer.author.activeSpaces = aboutAuthor.activeSpaces;
  if (aboutAuthor.joined) answer.author.joined = aboutAuthor.joined;
  if (aboutAuthor.followerCountText !== undefined) {
    answer.author.followerCount = parseMetric(aboutAuthor.followerCountText);
  }

  const result = { answer };

  if (includeComments) {
    if (answer.commentCount === 0) {
      result.comments = [];
    } else {
      await loadMoreComments(page, commentLimit);
      const { comments, partial } = await extractComments(page, commentLimit);
      result.comments = comments;
      if (partial) result.partial = true;
    }
  }

  return result;
}
