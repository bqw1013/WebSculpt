export default async (page, params, cwd) => {
  const repoRaw = (params.repo || "").trim();

  // ---- Validate repo param: owner/repo or a github.com URL ----
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

  const includeReadme = params.include_readme === "true";
  const url = "https://github.com/" + owner + "/" + repo;

  // ---- Polite pacing: random wait before navigation ----
  await page.waitForTimeout(200 + Math.floor(Math.random() * 500));

  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Failed to load repository page: " + e.message);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // ---- Fail-fast detection of not-found / rate-limited pages ----
  if (response) {
    if (response.status() === 404) {
      const err = new Error("[NOT_FOUND] Repository not found: " + owner + "/" + repo);
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
    const err = new Error("[NOT_FOUND] Repository not found: " + owner + "/" + repo);
    err.code = "NOT_FOUND";
    throw err;
  }

  // ---- Wait for SSR embedded data (script tags are hidden; wait for "attached") ----
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

  if (!embedded || !embedded.payload || !embedded.payload.sidebarAbout) {
    const err = new Error("[DRIFT_DETECTED] Repository page embedded data not found");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  const sa = embedded.payload.sidebarAbout || {};
  const repoInfo = (embedded.payload.codeViewLayoutRoute || {}).repo || {};
  const overview = ((embedded.payload.codeViewRepoRoute || {}).overview) || {};
  const protocolInfo = ((overview.codeButton || {}).local || {}).protocolInfo || {};
  const overviewFiles = overview.overviewFiles || [];

  const actualOwner = sa.ownerLogin || owner;
  const actualRepo = sa.repoName || repo;

  // ---- README text from embeddedData (if requested) ----
  let readme = null;
  if (includeReadme && overviewFiles.length && overviewFiles[0].richText) {
    readme = await page.evaluate((richText) => {
      const doc = new DOMParser().parseFromString(richText, "text/html");
      return doc.body.innerText;
    }, overviewFiles[0].richText);
  }

  // ---- Polite pacing: gentle random scroll + mouse move, then wait for hydration ----
  await page.evaluate(() => {
    window.scrollBy(0, 60 + Math.floor(Math.random() * 240));
  }).catch(() => {});
  await page.mouse.move(120 + Math.floor(Math.random() * 500), 100 + Math.floor(Math.random() * 300)).catch(() => {});
  await page.waitForTimeout(300 + Math.floor(Math.random() * 400));

  // ---- Hydration-only DOM fields: language, open_issues, latest commit time ----
  // Wait until the Languages section has both its heading AND at least one language
  // bar (span[aria-label]). The heading appears before the bars hydrate, so waiting
  // on the heading alone made `language` null intermittently.
  // NOTE: waitForFunction(pageFunction, arg, options) — the 2nd positional arg is the
  // function argument; options (timeout) must be the 3rd. Passing {timeout} as the 2nd
  // arg uses the default 30s timeout, which broke the ≤10s target on repos without a
  // Languages section.
  // Repos where embeddedData says sections.languages === false (e.g. README-only repos)
  // never render a Languages section — skip the wait entirely.
  const showLanguages = !(sa.sections && sa.sections.languages === false);
  if (showLanguages) {
    await page.waitForFunction(() => {
      const h2s = Array.from(document.querySelectorAll("h2"));
      const langH2 = h2s.find((h) => h.textContent.trim() === "Languages");
      if (!langH2) return false;
      const box = langH2.closest("section") || langH2.parentElement;
      return !!box.querySelector("span[aria-label]");
    }, null, { timeout: 6000 }).catch(() => {});
  }

  const domData = await page.evaluate(({ ownerName, repoName }) => {
    const all = (s) => Array.from(document.querySelectorAll(s));

    let language = null;
    const h2 = all("h2").find((h) => h.textContent.trim() === "Languages");
    if (h2) {
      const box = h2.closest("section") || h2.parentElement;
      const labels = Array.from(box.querySelectorAll("span[aria-label]"))
        .map((s) => s.getAttribute("aria-label"))
        .filter(Boolean);
      if (labels.length) {
        const first = labels[0];
        const idx = first.indexOf(":");
        language = (idx >= 0 ? first.slice(0, idx) : first).trim();
      }
    }

    let openIssues = null;
    const il = all("a").find((a) => a.getAttribute("href") === "/" + ownerName + "/" + repoName + "/issues");
    if (il) {
      const mm = il.innerText.replace(/\s+/g, " ").match(/Issues?\s+([\d,.]+[kKmM]?)/);
      openIssues = mm ? mm[1] : null;
    }

    const rt = document.querySelector("relative-time");
    const latestCommitAt = rt ? rt.getAttribute("datetime") : null;

    return { language, openIssues, latestCommitAt };
  }, { ownerName: actualOwner, repoName: actualRepo });

  const toIso = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t.toISOString();
  };

  const result = {
    full_name: actualOwner + "/" + actualRepo,
    description: sa.description != null ? sa.description : null,
    homepage: sa.website != null ? sa.website : null,
    html_url: "https://github.com/" + actualOwner + "/" + actualRepo,
    owner: {
      login: actualOwner,
      avatar_url: (sa.repo && sa.repo.ownerAvatarUrl) || repoInfo.ownerAvatar || null,
    },
    clone_url: protocolInfo.httpUrl || null,
    ssh_url: protocolInfo.sshUrl || null,
    stars: sa.stargazerCount != null ? sa.stargazerCount : null,
    forks: sa.forksCount != null ? sa.forksCount : null,
    watchers: sa.watcherCount != null ? sa.watcherCount : null,
    open_issues: domData.openIssues,
    language: domData.language,
    license: (sa.repo && sa.repo.license) || null,
    topics: Array.isArray(sa.topics) ? sa.topics.map((t) => t.name) : [],
    archived: (sa.repo && sa.repo.isArchived) || false,
    default_branch: repoInfo.defaultBranch || null,
    created_at: toIso(repoInfo.createdAt),
    updated_at: toIso(domData.latestCommitAt),
    pushed_at: toIso(domData.latestCommitAt),
  };

  if (includeReadme) {
    result.readme = readme;
  }

  // ---- EMPTY_RESULT guard: page loaded but no meaningful metadata extracted ----
  if (result.stars == null && result.description == null && result.default_branch == null) {
    const err = new Error("[EMPTY_RESULT] No repository metadata could be extracted");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return result;
};
