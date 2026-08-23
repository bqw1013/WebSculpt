// github/list-commits — browser runtime
// Reads commit history from https://github.com/{owner}/{repo}/commits[/{branch}]
// Primary data source: SSR <script data-target="react-app.embeddedData">
//   payload.commitsRoute|commitsRefRoute.commitGroups (wrapped under a route key)
// Pagination: <a rel="next"> href with ?after={oid}+{offset} cursor (35 commits/page)
// Follows repo renames via HTTP 301 (facebook/react -> react/react).

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
    const script = document.querySelector('script[data-target="react-app.embeddedData"]');
    const title = document.title;
    if (!script) {
      return { hasEmbeddedData: false, title, commits: [], nextHref: null };
    }
    let payload = null;
    try {
      payload = JSON.parse(script.textContent).payload;
    } catch (e) {
      return { hasEmbeddedData: false, title, commits: [], nextHref: null };
    }
    // GitHub wraps the commits data under commitsRoute (no ref in path) or
    // commitsRefRoute (explicit ref in path); both share the same shape.
    const route = payload.commitsRoute || payload.commitsRefRoute || null;
    if (!route) {
      // Neither route key present: the embedded payload shape changed again.
      return { hasEmbeddedData: false, title, commits: [], nextHref: null };
    }
    const groups = Array.isArray(route.commitGroups) ? route.commitGroups : [];
    const commits = [];
    for (const g of groups) {
      const list = g && Array.isArray(g.commits) ? g.commits : [];
      for (const c of list) {
        const authors = Array.isArray(c.authors) && c.authors.length ? c.authors : [];
        commits.push({
          oid: c.oid || null,
          message: c.shortMessage || null,
          author: authors[0] ? (authors[0].login || null) : null,
          authorAvatar: authors[0] ? (authors[0].avatarUrl || null) : null,
          authoredAt: c.authoredDate || null,
          url: c.url || null
        });
      }
    }
    const next = document.querySelector('a[rel="next"]');
    return {
      hasEmbeddedData: true,
      title,
      repoName: route.repo ? (route.repo.name || null) : null,
      ownerLogin: route.repo ? (route.repo.ownerLogin || null) : null,
      defaultBranch: route.repo ? (route.repo.defaultBranch || null) : null,
      refInfoName: route.refInfo ? (route.refInfo.name || null) : null,
      currentOid: route.refInfo ? (route.refInfo.currentOid || null) : null,
      commits,
      nextHref: next ? next.getAttribute('href') : null
    };
  });
}

export default async (page, params, cwd) => {
  // --- Parameter validation ---
  const repoInput = (params.repo || "").trim();
  if (!repoInput) {
    throw invalidParam("repo is required (owner/repo or full URL)");
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

  const branch = (params.branch || "").trim();
  if (branch && /[\s?#]/.test(branch)) {
    throw invalidParam("branch contains invalid characters (no whitespace, ? or #)");
  }

  const base = `https://github.com/${owner}/${repo}/commits`;
  const startUrl = branch ? `${base}/${branch}` : base;

  // --- Navigate to first page ---
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await humanize(page);

  // Wait for either the SSR embedded data or a GitHub 404 page.
  await page.waitForFunction(() => {
    return document.querySelector('script[data-target="react-app.embeddedData"]') !== null
      || /Page not found/i.test(document.title);
  }, { timeout: 20000 }).catch(() => {});

  let data = await extractPage(page);

  if (!data.hasEmbeddedData) {
    if (/Page not found/i.test(data.title || "")) {
      throw notFound(`Repository not found: ${owner}/${repo}`);
    }
    throw drift("GitHub commits page structure changed: react-app.embeddedData not found");
  }

  // Resolve effective repo (follows redirects) and branch.
  const effectiveOwner = data.ownerLogin || owner;
  const effectiveRepo = data.repoName || repo;
  const effectiveBranch = data.refInfoName || branch || data.defaultBranch || null;

  // Branch / empty resolution.
  if (!data.currentOid) {
    if (branch) {
      throw notFound(`Branch not found: ${branch} in ${effectiveOwner}/${effectiveRepo}`);
    }
    const emptyError = new Error(`[EMPTY_RESULT] No commits found for ${effectiveOwner}/${effectiveRepo}`);
    emptyError.code = "EMPTY_RESULT";
    throw emptyError;
  }

  // --- Collect commits, paginating until limit or end of history ---
  const seen = new Set();
  const collected = [];
  const pushUnique = (list) => {
    for (const c of list) {
      if (c.oid && !seen.has(c.oid)) {
        seen.add(c.oid);
        collected.push(c);
      }
    }
  };
  pushUnique(data.commits);

  let lastPageHadNext = !!data.nextHref;

  while (collected.length < limit && data.nextHref) {
    const nextUrl = /^https?:/.test(data.nextHref) ? data.nextHref : `https://github.com${data.nextHref}`;
    await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanize(page);
    await page.waitForFunction(() => {
      return document.querySelector('script[data-target="react-app.embeddedData"]') !== null;
    }, { timeout: 20000 }).catch(() => {});
    data = await extractPage(page);
    if (!data.hasEmbeddedData) {
      break;
    }
    lastPageHadNext = !!data.nextHref;
    pushUnique(data.commits);
  }

  const sliced = collected.slice(0, limit);
  // partial = true when the result is truncated at limit while more history exists.
  const partial = sliced.length === limit && (lastPageHadNext || collected.length > limit);

  return {
    repo: `${effectiveOwner}/${effectiveRepo}`,
    branch: effectiveBranch,
    count: sliced.length,
    partial,
    commits: sliced.map((c) => ({
      sha: c.oid,
      message: c.message,
      author: c.author,
      author_avatar: c.authorAvatar,
      authored_at: c.authoredAt,
      html_url: c.url ? `https://github.com${c.url}` : null
    }))
  };
};
