// Helper: parse a unified-diff plain-text body into per-file change records.
// Format produced by https://github.com/{owner}/{repo}/pull/{n}.diff
function parseDiff(text) {
  const files = [];
  const blocks = text.split(/(?=^diff --git )/m).filter((b) => b.startsWith("diff --git "));
  for (const block of blocks) {
    const lines = block.split("\n");
    const m = lines[0].match(/diff --git a\/(.*?) b\/(.*)/);
    const newPath = m ? m[2] : "";
    let status = "modified";
    let additions = 0;
    let deletions = 0;
    let renameTo = null;
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.startsWith("new file mode")) {
        status = "added";
      } else if (ln.startsWith("deleted file mode")) {
        status = "deleted";
      } else if (ln.startsWith("similarity index")) {
        status = "renamed";
      } else if (ln.startsWith("rename to")) {
        renameTo = ln.slice("rename to ".length);
        status = "renamed";
      } else if (ln.startsWith("rename from")) {
        status = "renamed";
      } else if (ln.startsWith("+++") || ln.startsWith("---")) {
        continue;
      } else if (ln.startsWith("+")) {
        additions += 1;
      } else if (ln.startsWith("-")) {
        deletions += 1;
      }
    }
    const filename = renameTo || newPath;
    files.push({ filename, status, additions, deletions, changes: additions + deletions });
  }
  return files;
}

export default async (page, params, cwd) => {
  // ---- Validate repo param: owner/repo or a github.com URL ----
  const repoRaw = (params.repo || "").trim();
  let owner = null;
  let repo = null;
  const clean = repoRaw.replace(/\/+$/, "");
  const m = clean.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/?#]+)\/([^\/?#]+)/i);
  if (m) {
    owner = m[1];
    repo = m[2];
  } else {
    const parts = clean.split("/");
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

  // ---- Validate number param: positive integer PR number ----
  const numberStr = (params.number || "").trim();
  const number = Number(numberStr);
  if (!/^\d+$/.test(numberStr) || !Number.isInteger(number) || number <= 0) {
    const err = new Error("[INVALID_PARAM] number must be a positive integer PR number, e.g. 37251 in https://github.com/react/react/pull/37251");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const includeFiles = params.include_files === "true";
  const prUrl = "https://github.com/" + owner + "/" + repo + "/pull/" + number;

  // ---- Rate awareness: random wait before navigation ----
  await page.waitForTimeout(200 + Math.floor(Math.random() * 500));

  // ---- Navigate to the PR conversation page ----
  let response = null;
  try {
    response = await page.goto(prUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Failed to load pull request page: " + e.message);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // ---- Fail-fast detection of not-found / rate-limited pages ----
  if (response) {
    if (response.status() === 404) {
      const err = new Error("[NOT_FOUND] Pull request not found: " + owner + "/" + repo + "#" + number);
      err.code = "NOT_FOUND";
      throw err;
    }
    if (response.status() === 429 || response.status() === 403) {
      const err = new Error("[NETWORK_ERROR] GitHub rate-limited or blocked the request (HTTP " + response.status() + "). Slow down and retry.");
      err.code = "NETWORK_ERROR";
      throw err;
    }
  }
  const pageTitle = await page.title().catch(() => "");
  if (/Page not found/i.test(pageTitle)) {
    const err = new Error("[NOT_FOUND] Pull request not found: " + owner + "/" + repo + "#" + number);
    err.code = "NOT_FOUND";
    throw err;
  }

  // ---- Wait for SSR embedded data ----
  await page.waitForSelector('script[type="application/json"][data-target="react-app.embeddedData"]', { state: "attached", timeout: 15000 });

  const embedded = await page.evaluate(() => {
    const script = document.querySelector('script[type="application/json"][data-target="react-app.embeddedData"]');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (e) {
      return null;
    }
  });

  const prRoute = embedded && embedded.payload && embedded.payload.pullRequestsLayoutRoute;
  if (!prRoute || !prRoute.pullRequest) {
    // A non-PR number redirects to /issues/{n} and 404s; a valid PR always has this route.
    const err = new Error("[NOT_FOUND] Pull request not found: " + owner + "/" + repo + "#" + number);
    err.code = "NOT_FOUND";
    throw err;
  }
  const pr = prRoute.pullRequest;
  const repoInfo = prRoute.repository || {};
  const actualOwner = repoInfo.ownerLogin || owner;
  const actualRepo = repoInfo.name || repo;
  const num = pr.number || number;

  // ---- Polite pacing: gentle random scroll + mouse move, then let the page hydrate ----
  await page.evaluate(() => {
    window.scrollBy(0, 60 + Math.floor(Math.random() * 240));
  }).catch(() => {});
  await page.mouse.move(120 + Math.floor(Math.random() * 500), 100 + Math.floor(Math.random() * 300)).catch(() => {});
  await page.waitForTimeout(300 + Math.floor(Math.random() * 400));

  // Wait for the sidebar/body to hydrate (short timeout; proceed if slow).
  await page.waitForFunction(() => {
    const items = document.querySelectorAll(".js-discussion-sidebar-item");
    return items.length >= 3 && (items[0].innerText || "").trim().length > 0;
  }, { timeout: 6000 }).catch(() => {});

  // ---- Hydration DOM fields: body, labels, assignees ----
  const domData = await page.evaluate(() => {
    const all = (s) => Array.from(document.querySelectorAll(s));
    const bodyEl = document.querySelector(".js-command-palette-pull-body .js-comment-body");
    const body = bodyEl ? bodyEl.innerText.trim() : null;
    const labels = all(".js-issue-labels a[data-name]").map((a) => a.getAttribute("data-name"));
    const assignees = all(".js-issue-assignees a[data-hovercard-url]")
      .map((a) => {
        const mm = a.getAttribute("data-hovercard-url").match(/\/users\/([^/?]+)/);
        return mm ? mm[1] : null;
      })
      .filter(Boolean);
    return { body, labels, assignees };
  });

  // ---- GitHub's own page_data JSON endpoints (change sizes / merge state / reviews) ----
  const pd = await page.evaluate(async ({ ownerName, repoName, prNum }) => {
    const base = "/" + ownerName + "/" + repoName + "/pull/" + prNum;
    const headers = { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" };
    const fj = async (p) => {
      try {
        const r = await fetch(base + p, { headers });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) {
        return null;
      }
    };
    const [tab, diff, mb] = await Promise.all([
      fj("/page_data/tab_counts"),
      fj("/page_data/diffstat"),
      fj("/page_data/merge_box?merge_method=SQUASH&bypass_requirements=false"),
    ]);
    return { tab, diff, mb };
  }, { ownerName: actualOwner, repoName: actualRepo, prNum: num });

  if (!pd.tab && !pd.diff && !pd.mb) {
    const err = new Error("[NETWORK_ERROR] GitHub page data endpoints are unreachable for this pull request");
    err.code = "NETWORK_ERROR";
    throw err;
  }

  const toIso = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t.toISOString();
  };

  const conditions = (pd.mb && pd.mb.mergeRequirements && pd.mb.mergeRequirements.conditions) || [];
  const conflict = conditions.find((c) => c.type === "PULL_REQUEST_MERGE_CONFLICT_STATE");

  const result = {
    number: num,
    title: pr.title,
    state: (pr.state || "").toLowerCase(),
    merged: pr.mergedTime != null,
    mergeable: conflict ? conflict.result === "PASSED" : null,
    html_url: "https://github.com/" + actualOwner + "/" + actualRepo + "/pull/" + num,
    author: (pr.author && pr.author.login) || null,
    body: domData.body,
    base_ref: pr.baseBranch || null,
    head_ref: pr.headBranch || null,
    labels: domData.labels,
    assignees: domData.assignees,
    commits: pr.commitsCount != null ? pr.commitsCount : (pd.mb && pd.mb.pullRequest ? pd.mb.pullRequest.numberOfCommits : null),
    additions: pd.diff && pd.diff.diffstat ? pd.diff.diffstat.linesAdded : null,
    deletions: pd.diff && pd.diff.diffstat ? pd.diff.diffstat.linesDeleted : null,
    changed_files: pd.tab ? pd.tab.filesChangedCount : null,
    checks: pd.tab ? pd.tab.checksCount : null,
    reviews: pd.mb && pd.mb.pullRequest && Array.isArray(pd.mb.pullRequest.latestOpinionatedReviews)
      ? pd.mb.pullRequest.latestOpinionatedReviews.length
      : null,
    is_draft: pd.mb && pd.mb.pullRequest ? pd.mb.pullRequest.isDraft : null,
    created_at: toIso(pr.createdTime),
    closed_at: toIso(pr.closedTime),
    merged_at: toIso(pr.mergedTime),
    merged_by: pr.mergedBy || null,
  };

  // ---- EMPTY_RESULT guard: page loaded but no meaningful PR data extracted ----
  if (!result.title && !result.author && !result.base_ref) {
    const err = new Error("[EMPTY_RESULT] No pull request metadata could be extracted");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  // ---- include_files: load the .diff plain-text endpoint and parse per-file changes ----
  if (includeFiles) {
    await page.waitForTimeout(200 + Math.floor(Math.random() * 400));
    try {
      await page.goto(prUrl + ".diff", { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      const err = new Error("[NETWORK_ERROR] Failed to load pull request diff: " + e.message);
      err.code = "NETWORK_ERROR";
      throw err;
    }
    const diffText = await page.evaluate(() => document.body.innerText || "");
    result.files = parseDiff(diffText);
  }

  return result;
};
