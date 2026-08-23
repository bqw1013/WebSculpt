export default async (page, params, cwd) => {
  const repoRaw = (params.repo || "").trim();
  const numberRaw = (params.number || "").trim();

  // ---- Validate repo: owner/repo or a github.com URL ----
  let owner = null;
  let repo = null;
  const cleanRepo = repoRaw.replace(/\/+$/, "");
  const m = cleanRepo.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/?#]+)\/([^\/?#]+)/i);
  if (m) {
    owner = m[1];
    repo = m[2];
  } else {
    const parts = cleanRepo.split("/");
    if (parts.length === 2) {
      owner = parts[0];
      repo = parts[1];
    }
  }
  const safe = /^[A-Za-z0-9_.-]+$/;
  if (!owner || !repo || !safe.test(owner) || !safe.test(repo)) {
    const err = new Error("[INVALID_PARAM] repo must be owner/repo (e.g. facebook/react) or a full GitHub URL (https://github.com/facebook/react)");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // ---- Validate number: positive integer ----
  if (!/^\d+$/.test(numberRaw)) {
    const err = new Error("[INVALID_PARAM] number must be a positive integer issue number, e.g. 123 for https://github.com/" + owner + "/" + repo + "/issues/123");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const number = parseInt(numberRaw, 10);
  if (!(number > 0)) {
    const err = new Error("[INVALID_PARAM] number must be a positive integer issue number");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const includeComments = params.include_comments === "true";
  const baseUrl = "https://github.com/" + owner + "/" + repo + "/issues/" + number;

  // ---- Rate awareness: random wait before navigation ----
  await page.waitForTimeout(200 + Math.floor(Math.random() * 500));

  let response = null;
  try {
    response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Failed to load issue page: " + e.message);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // ---- Fail-fast detection of not-found / rate-limited / PR-redirect pages ----
  if (response && response.status() === 404) {
    const err = new Error("[NOT_FOUND] Issue #" + number + " not found in " + owner + "/" + repo);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (response && (response.status() === 429 || response.status() === 403)) {
    const err = new Error("[NETWORK_ERROR] GitHub rate-limited or blocked the request (HTTP " + response.status() + "). Slow down and retry.");
    err.code = "NETWORK_ERROR";
    throw err;
  }

  const finalUrl = page.url();
  // A PR number redirects /issues/{n} -> /pull/{n}; that number is not an issue.
  if (/\/pull\/\d+/.test(finalUrl)) {
    const err = new Error("[NOT_FOUND] #" + number + " in " + owner + "/" + repo + " is a Pull Request, not an issue (redirected to /pull/" + number + "). Use github/get-pull instead.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const pageTitle = await page.title().catch(() => "");
  if (/Page not found/i.test(pageTitle)) {
    const err = new Error("[NOT_FOUND] Issue #" + number + " not found in " + owner + "/" + repo);
    err.code = "NOT_FOUND";
    throw err;
  }

  // ---- Wait for the hydrated issue body, then gentle polite-pacing interaction ----
  try {
    await page.waitForSelector("[data-testid=issue-body-viewer]", { timeout: 15000 });
  } catch (e) {
    const err = new Error("[DRIFT_DETECTED] Issue page did not render an issue body (structure may have changed)");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  await page.evaluate(() => {
    window.scrollBy(0, 60 + Math.floor(Math.random() * 240));
  }).catch(() => {});
  await page.mouse.move(120 + Math.floor(Math.random() * 500), 100 + Math.floor(Math.random() * 300)).catch(() => {});
  await page.waitForTimeout(250 + Math.floor(Math.random() * 350));

  // ---- Extract metadata + comments + pagination link from the current page ----
  const extractPage = () =>
    page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const qa = (s) => Array.from(document.querySelectorAll(s));
      const clean = (s) => (s || "").trim().replace(/\s+/g, " ");
      const url = location.href;
      const numMatch = url.match(/issues\/(\d+)/);
      const title = q("[data-testid=issue-title]") ? clean(q("[data-testid=issue-title]").innerText) : null;
      const state = q("[data-testid=header-state]") ? clean(q("[data-testid=header-state]").innerText) : null;
      const authorEl = q("[data-testid=issue-body-header-author]");
      const author = authorEl ? clean(authorEl.textContent) : null;
      const bodyViewer = q("[data-testid=issue-body-viewer]");
      // Extract the markdown body only; the issue-body-viewer container also holds the
      // reaction bar (e.g. "👍 3"), which is UI chrome, not part of the body text.
      const bodyEl = (bodyViewer && bodyViewer.querySelector(".markdown-body")) || (bodyViewer && bodyViewer.querySelector("[data-testid=markdown-body]")) || bodyViewer;
      const body = bodyEl ? bodyEl.innerText.trim() : null;
      const labels = qa("[data-testid=sidebar-labels-section] a, [data-testid=issue-labels] a")
        .map((a) => {
          const sp = a.querySelector("span");
          if (sp) return sp.textContent.trim();
          return clean(a.innerText).split(/Opened by|described/)[0].trim();
        })
        .filter(Boolean);
      const ms = q("[data-testid=sidebar-milestones-section]");
      const msA = ms ? ms.querySelector("a") : null;
      const milestone = msA ? msA.textContent.replace(/\s*No due date.*/i, "").trim() : null;
      const asec = q("[data-testid=sidebar-assignees-section]");
      const assignees = asec ? Array.from(asec.querySelectorAll("a[href^=\"/\"]")).map((a) => clean(a.textContent)).filter(Boolean) : [];
      const bodyHeader = q("[data-testid=issue-body]");
      const createdRt = bodyHeader ? bodyHeader.querySelector("relative-time") : null;
      const created_at = createdRt ? createdRt.getAttribute("datetime") : null;
      let closed_at = null;
      const closedRow = qa("[data-testid^=timeline-row]").find((r) => /closed this/i.test(r.innerText || ""));
      if (closedRow) {
        const rt = closedRow.querySelector("relative-time");
        closed_at = rt ? rt.getAttribute("datetime") : null;
      }
      const comments = qa(".react-issue-comment").map((c) => {
        const outer = c.querySelector("[data-testid^=comment-viewer-outer-box]");
        const avatar = c.querySelector("[data-testid=avatar-link]");
        const rt = c.querySelector("relative-time");
        const bodyEl = c.querySelector(".markdown-body") || c.querySelector("[data-testid=comment-body]");
        return {
          id: outer ? outer.getAttribute("data-testid") : null,
          author: avatar ? avatar.getAttribute("href").replace(/^\/+/, "") : null,
          body: bodyEl ? bodyEl.innerText.trim() : null,
          created_at: rt ? rt.getAttribute("datetime") : null,
        };
      });
      const nextA = q("[data-testid=timeline-crawler-pagination] a");
      return {
        number: numMatch ? parseInt(numMatch[1], 10) : null,
        title,
        state,
        author,
        body,
        labels,
        assignees,
        milestone,
        created_at,
        closed_at,
        comments,
        next_page: nextA ? nextA.getAttribute("href") : null,
      };
    });

  const first = await extractPage();

  // ---- EMPTY_RESULT guard: page loaded but nothing meaningful extracted ----
  if (!first.title && !first.body && !first.state) {
    const err = new Error("[EMPTY_RESULT] No issue data could be extracted from the page");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // Canonical owner/repo from the final URL (handles facebook/react -> react/react redirect).
  const urlOwnerMatch = finalUrl.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\//);
  const actualOwner = urlOwnerMatch ? urlOwnerMatch[1] : owner;
  const actualRepo = urlOwnerMatch ? urlOwnerMatch[2] : repo;

  let closedAt = first.closed_at;
  let comments = first.comments || [];

  // ---- include_comments: follow ?timeline_page=N until no more pages ----
  if (includeComments) {
    let next = first.next_page;
    let pages = 1;
    const seen = new Set(comments.map((c) => c.id).filter(Boolean));
    while (next && pages < 10) {
      const nextUrl = new URL(next, "https://github.com").href;
      await page.waitForTimeout(200 + Math.floor(Math.random() * 400));
      let resp = null;
      try {
        resp = await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      } catch (e) {
        break; // network hiccup on a later page: keep what we already have
      }
      if (resp && (resp.status() === 404 || resp.status() === 429 || resp.status() === 403)) break;
      try {
        await page.waitForSelector("[data-testid=issue-body-viewer]", { timeout: 10000 });
      } catch (e) {
        break;
      }
      const pg = await extractPage();
      for (const c of pg.comments || []) {
        if (c.id && !seen.has(c.id)) {
          seen.add(c.id);
          comments.push(c);
        } else if (!c.id) {
          comments.push(c);
        }
      }
      if (!closedAt && pg.closed_at) closedAt = pg.closed_at;
      next = pg.next_page;
      pages += 1;
    }
  }

  const cleanComments = comments.map(({ id, ...rest }) => rest);

  const result = {
    number: first.number != null ? first.number : number,
    title: first.title,
    state: first.state,
    html_url: "https://github.com/" + actualOwner + "/" + actualRepo + "/issues/" + number,
    author: first.author,
    body: first.body,
    labels: first.labels,
    assignees: first.assignees,
    milestone: first.milestone,
    comments_count: includeComments ? cleanComments.length : comments.length,
    created_at: first.created_at,
    closed_at: closedAt,
  };

  if (includeComments) {
    result.comments = cleanComments;
  }

  return result;
};
