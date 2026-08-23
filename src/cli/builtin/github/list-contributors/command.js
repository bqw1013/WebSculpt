// github/list-contributors — browser runtime
// Extraction path verified in explore:
//   goto /graphs/contributors
//   -> read script[data-target="react-app.embeddedData"].payload.graphDataPath
//   -> fetch(graphDataPath, { headers: { Accept: 'application/json' } })
//   -> sort by total desc, take top N
// The endpoint mirrors the page's own chart JS request, so it does not hit the
// GitHub REST API quota and is stable against 429/403 under normal cadence.

// Server-side cap observed for the /graphs/contributors-data endpoint.
const SERVER_CAP = 500;

function bizError(code, msg) {
  const err = new Error(`[${code}] ${msg}`);
  err.code = code;
  return err;
}

// Rate awareness: random wait to avoid a deterministic request pattern.
function randomWait() {
  return new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 500));
}

// Accept "facebook/react" or "https://github.com/facebook/react" (with/without trailing slash).
function parseRepo(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      return null;
    }
  }
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = s.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export default async (page, params, cwd) => {
  // ---- pre-flight param validation (fail before any page access) ----
  const parsed = parseRepo(params.repo);
  if (!parsed) {
    throw bizError('INVALID_PARAM', 'repo must be owner/repo or a full GitHub URL, e.g. facebook/react');
  }
  const limit = parseInt(params.limit, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    throw bizError('INVALID_PARAM', 'limit must be an integer between 1 and 100');
  }

  const targetUrl = `https://github.com/${parsed.owner}/${parsed.repo}/graphs/contributors`;

  // ---- load the rendered contributors page ----
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    throw bizError('NETWORK_ERROR', `Failed to load contributors page: ${e.message}`);
  }

  // Fail-fast on 404 before waiting for the content selector.
  const title = await page.title();
  if (title.includes('Page not found')) {
    throw bizError('NOT_FOUND', `Repository ${parsed.owner}/${parsed.repo} was not found`);
  }

  // ---- read embeddedData -> graphDataPath + canonical repoUrl ----
  // Poll via evaluate (same document.querySelector that worked in explore); more
  // robust than a CSS waitForSelector for this script tag.
  let embedded = null;
  const embeddedDeadline = Date.now() + 15000;
  while (Date.now() < embeddedDeadline) {
    embedded = await page.evaluate(() => {
      const el = document.querySelector('script[data-target="react-app.embeddedData"]');
      if (!el) return null;
      try {
        const data = JSON.parse(el.textContent || '');
        if (!data || !data.payload) return null;
        return {
          graphDataPath: data.payload.graphDataPath || null,
          repoUrl: (data.payload.repoUrl || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '')
        };
      } catch {
        return null;
      }
    });
    if (embedded && embedded.graphDataPath) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!embedded || !embedded.graphDataPath) {
    const curUrl = page.url();
    const curTitle = await page.title().catch(() => '');
    throw bizError('DRIFT_DETECTED', `Contributors page structure changed: embeddedData script not found (url=${curUrl}, title=${curTitle})`);
  }

  // ---- rate awareness: random wait before the internal fetch ----
  await randomWait();

  // ---- fetch the full contributor dataset inside the page context ----
  // Mapping and sorting happen in the page to avoid transferring the large `weeks` arrays.
  let result;
  try {
    result = await page.evaluate(
      async ({ path, cap, serverCap }) => {
        const res = await fetch(path, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const mapped = data.map((d) => ({
          login: d.author.login,
          avatar_url: d.author.avatar,
          html_url: 'https://github.com' + d.author.path,
          contributions: d.total
        }));
        mapped.sort((a, b) => b.contributions - a.contributions);
        return {
          totalCount: mapped.length,
          items: mapped.slice(0, cap),
          truncated: mapped.length >= serverCap
        };
      },
      { path: embedded.graphDataPath, cap: limit, serverCap: SERVER_CAP }
    );
  } catch (e) {
    throw bizError('NETWORK_ERROR', `Failed to fetch contributor data: ${e.message}`);
  }

  if (!result.totalCount) {
    throw bizError('EMPTY_RESULT', 'No contributor data available for this repository');
  }

  return {
    repo: embedded.repoUrl || `${parsed.owner}/${parsed.repo}`,
    count: result.items.length,
    partial: result.truncated,
    contributors: result.items
  };
};
