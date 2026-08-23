// github/list-pulls — browser runtime
// Reads pull requests from https://github.com/{owner}/{repo}/pulls
// Primary data source: SSR DOM (.js-issue-row) + hydrated fields (comment count, review decision badge).
// state filter -> q=is:pr is:{state} (all -> q=is:pr); sort -> sort:created-desc / updated-desc / comments-desc.
// Pagination: <a rel="next"> href ?page=N (25 PRs/page).
// Follows repo renames via HTTP 301 (facebook/react -> react/react).

const DEFAULT_STATE = "open";
const DEFAULT_SORT = "created";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const VALID_STATES = ["open", "closed", "merged", "all"];
const VALID_SORTS = ["created", "updated", "comments"];
const STATE_TOKENS = { open: "is:open", closed: "is:closed", merged: "is:merged", all: "" };
const SORT_TOKENS = { created: "sort:created-desc", updated: "sort:updated-desc", comments: "sort:comments-desc" };

function invalidParam(message) {
  const err = new Error(`[INVALID_PARAM] ${message}`);
  err.code = "INVALID_PARAM";
  return err;
}

function notFound(message) {
  const err = new Error(`[NOT_FOUND] ${message}`);
  err.code = "NOT_FOUND";
  return err;
}

function emptyResult(message) {
  const err = new Error(`[EMPTY_RESULT] ${message}`);
  err.code = "EMPTY_RESULT";
  return err;
}

function drift(message) {
  const err = new Error(`[DRIFT_DETECTED] ${message}`);
  err.code = "DRIFT_DETECTED";
  return err;
}

async function humanize(page) {
  // Rate awareness: random wait + small random scroll + random mouse move. Best-effort.
  try {
    await page.waitForTimeout(250 + Math.floor(Math.random() * 350));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 400));
    });
    await page.waitForTimeout(150 + Math.floor(Math.random() * 200));
    const vp = page.viewportSize();
    if (vp && vp.width && vp.height) {
      await page.mouse.move(
        Math.floor(Math.random() * vp.width),
        Math.floor(Math.random() * vp.height)
      );
    }
  } catch (e) {
    // Never fail the command because of humanization.
  }
}

async function extractPage(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("div.js-issue-row"));
    const items = rows.map((r) => {
      const titleEl = r.querySelector('a[data-hovercard-type="pull_request"]');
      const stateEl = r.querySelector('[aria-label$="Pull Request"]');
      const stateRaw = stateEl ? stateEl.getAttribute("aria-label") || "" : "";
      const isDraft = /Draft/i.test(stateRaw);
      const state = /Merged/i.test(stateRaw)
        ? "merged"
        : /Closed/i.test(stateRaw)
          ? "closed"
          : "open";
      const authorEl = r.querySelector("span.opened-by a.Link--muted");
      const relTime = r.querySelector("span.opened-by relative-time");
      const commentEl = r.querySelector('a[aria-label$="comments"]');
      const reviewEl = r.querySelector('a[href*="partial-pull-merging"]');
      const labels = Array.from(r.querySelectorAll("a.IssueLabel"))
        .map((l) => (l.textContent || "").trim())
        .filter(Boolean);
      const ts = relTime ? relTime.getAttribute("datetime") : null;
      const num = parseInt(String(r.id || "").replace("issue_", ""), 10);
      const href = titleEl ? titleEl.getAttribute("href") : null;
      const item = {
        number: Number.isNaN(num) ? null : num,
        title: titleEl ? (titleEl.textContent || "").trim() : null,
        state,
        html_url: href ? "https://github.com" + href : null,
        author: authorEl ? (authorEl.textContent || "").trim() : null,
        labels,
        draft: isDraft,
        comments: commentEl
          ? parseInt(String(commentEl.getAttribute("aria-label")).replace(" comments", ""), 10)
          : 0,
        review_decision: reviewEl ? (reviewEl.textContent || "").trim() : null
      };
      if (state === "closed") item.closed_at = ts;
      else if (state === "merged") item.merged_at = ts;
      else item.created_at = ts;
      return item;
    });
    const next = document.querySelector('a[rel="next"]');
    return {
      title: document.title,
      hasRepoContent: !!document.querySelector("#repo-content-pjax-container"),
      rowCount: rows.length,
      bodyText: (document.body.innerText || "").slice(0, 4000),
      items,
      nextHref: next ? next.getAttribute("href") : null
    };
  });
}

export default async (page, params, cwd) => {
  // --- Parameter validation ---
  const repoInput = String(params.repo || "").trim();
  if (!repoInput) {
    throw invalidParam("repo is required (owner/repo or full URL)");
  }

  let state = DEFAULT_STATE;
  if (params.state !== undefined && params.state !== null && String(params.state).trim() !== "") {
    state = String(params.state).trim();
  }
  if (!VALID_STATES.includes(state)) {
    throw invalidParam("state must be one of: open (未关闭), closed (已关闭), merged (已合并), all (全部)");
  }

  let sort = DEFAULT_SORT;
  if (params.sort !== undefined && params.sort !== null && String(params.sort).trim() !== "") {
    sort = String(params.sort).trim();
  }
  if (!VALID_SORTS.includes(sort)) {
    throw invalidParam("sort must be one of: created (按创建时间), updated (按更新时间), comments (按评论数)");
  }

  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined && params.limit !== null && String(params.limit).trim() !== "") {
    limit = parseInt(String(params.limit).trim(), 10);
    if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw invalidParam(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
  }

  // --- Normalize repo (owner/repo or full URL) ---
  let owner;
  let repo;
  if (/^https?:\/\//i.test(repoInput)) {
    let u;
    try {
      u = new URL(repoInput);
    } catch (e) {
      throw invalidParam("repo URL is invalid");
    }
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) {
      throw invalidParam("repo URL must point to a repository (e.g. https://github.com/facebook/react)");
    }
    owner = segs[0];
    repo = segs[1];
  } else {
    const segs = repoInput.split("/").filter(Boolean);
    if (segs.length !== 2) {
      throw invalidParam("repo must be owner/repo (e.g. facebook/react) or a full URL");
    }
    owner = segs[0];
    repo = segs[1];
  }

  // --- Build URL (explicit state + sort; page default may be unstable) ---
  const qParts = ["is:pr"];
  if (STATE_TOKENS[state]) qParts.push(STATE_TOKENS[state]);
  qParts.push(SORT_TOKENS[sort]);
  const q = qParts.join(" ");
  const startUrl = `https://github.com/${owner}/${repo}/pulls?q=${encodeURIComponent(q)}`;

  // --- Navigate to first page ---
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await humanize(page);

  // Wait for either rows (valid repo), a GitHub 404 page, or an empty result.
  await page.waitForFunction(() => {
    if (/Page not found/i.test(document.title)) return true;
    if (!document.querySelector("#repo-content-pjax-container")) return true;
    if (document.querySelectorAll("div.js-issue-row").length > 0) return true;
    // Empty state: no rows but the page finished loading (SSR "No results" text).
    return /no results|no pull requests|There aren.t any|nothing here/i.test(
      (document.body.innerText || "").slice(0, 4000)
    );
  }, { timeout: 25000 }).catch(() => {});

  let data = await extractPage(page);

  // Error detection must come before the empty-check (failure-first).
  if (/Page not found/i.test(data.title || "") || !data.hasRepoContent) {
    throw notFound(`Repository not found: ${owner}/${repo}`);
  }

  // --- Hydration settle: comment counts and review decisions load after SSR ---
  await page.waitForFunction(() => {
    return !document.querySelector("batch-deferred-content .Skeleton");
  }, { timeout: 6000 }).catch(() => {});

  data = await extractPage(page);

  if (data.rowCount === 0) {
    if (/no results|no pull requests|There aren.t any|nothing here/i.test(data.bodyText || "")) {
      throw emptyResult(`No pull requests found for ${owner}/${repo} (state=${state})`);
    }
    throw drift("GitHub pulls page structure changed: js-issue-row not found and no empty state");
  }

  // --- Resolve effective repo (follows redirects, e.g. facebook/react -> react/react) ---
  let effectiveOwner = owner;
  let effectiveRepo = repo;
  try {
    const u = new URL(page.url());
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length >= 2) {
      effectiveOwner = segs[0];
      effectiveRepo = segs[1];
    }
  } catch (e) {
    // keep original owner/repo
  }

  // --- Collect PRs, paginating until limit or end of list ---
  const seen = new Set();
  const collected = [];
  const pushUnique = (list) => {
    for (const it of list) {
      if (it.number != null && !seen.has(it.number)) {
        seen.add(it.number);
        collected.push(it);
      }
    }
  };
  pushUnique(data.items);

  let lastPageHadNext = !!data.nextHref;

  while (collected.length < limit && data.nextHref) {
    const nextUrl = /^https?:/.test(data.nextHref)
      ? data.nextHref
      : `https://github.com${data.nextHref}`;
    await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanize(page);
    await page.waitForFunction(() => {
      return document.querySelectorAll("div.js-issue-row").length > 0;
    }, { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => {
      return !document.querySelector("batch-deferred-content .Skeleton");
    }, { timeout: 6000 }).catch(() => {});
    data = await extractPage(page);
    if (data.rowCount === 0) {
      break;
    }
    lastPageHadNext = !!data.nextHref;
    pushUnique(data.items);
  }

  const sliced = collected.slice(0, limit);
  // partial = true when the result is truncated at limit while more PRs exist.
  const partial = sliced.length === limit && (lastPageHadNext || collected.length > limit);

  return {
    repo: `${effectiveOwner}/${effectiveRepo}`,
    state,
    sort,
    count: sliced.length,
    partial,
    pulls: sliced
  };
};
