// github/search — search GitHub repositories/users/issues/pull-requests by keyword.
// browser runtime. Reads the rendered search page's react-app.embeddedData (primary)
// with a DOM fallback on [data-testid="results-list"]. No login required.

// user-side type value -> GitHub search URL `type` value.
// NOTE: `pull-requests` (hyphen) is silently interpreted as repositories by GitHub,
// so it MUST be mapped to `pullrequests` before building the URL.
const TYPE_URL = {
  repositories: 'repositories',
  users: 'users',
  issues: 'issues',
  'pull-requests': 'pullrequests'
};

// sort value -> extra query params (repositories only; other types ignore sort).
const SORT_PARAM = {
  'best-match': '',
  stars: '&s=stars&o=desc',
  updated: '&s=updated&o=desc'
};

const PAGE_SIZE = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSleep = (min = 200, max = 700) => sleep(min + Math.floor(Math.random() * (max - min)));

function makeError(code, message) {
  const e = new Error(`[${code}] ${message}`);
  e.code = code;
  return e;
}

// ---- primary extraction: react-app.embeddedData payload.results ----
async function extractFromEmbedded(page, type) {
  return page.evaluate((t) => {
    const strip = (s) => (s == null ? null : s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const script = document.querySelector('script[data-target="react-app.embeddedData"]');
    if (!script) return null;
    let payload;
    try {
      payload = JSON.parse(script.textContent || '{}').payload;
    } catch (e) {
      return null;
    }
    if (!payload || !Array.isArray(payload.results)) return null;
    const out = [];
    for (const r of payload.results) {
      const repo = r.repo && r.repo.repository ? r.repo.repository : null;
      if (t === 'repositories') {
        out.push({
          full_name: repo ? `${repo.owner_login}/${repo.name}` : strip(r.hl_name),
          html_url: repo ? `https://github.com/${repo.owner_login}/${repo.name}` : null,
          description: strip(r.hl_trunc_description),
          language: r.language || null,
          stars: r.followers != null ? r.followers : 0,
          updated_at: repo ? repo.updated_at : null,
          topics: Array.isArray(r.topics) ? r.topics : [],
          archived: !!r.archived
        });
      } else if (t === 'users') {
        out.push({
          login: r.login || null,
          name: r.name || strip(r.hl_name) || null,
          html_url: r.login ? `https://github.com/${r.login}` : null,
          bio: strip(r.profile_bio) || null,
          location: r.location || null,
          followers: r.followers != null ? r.followers : 0,
          repos: r.repos != null ? r.repos : 0
        });
      } else {
        const isPr = t === 'pull-requests';
        const seg = isPr ? 'pull' : 'issues';
        const base = repo ? `https://github.com/${repo.owner_login}/${repo.name}` : null;
        const item = {
          number: r.number != null ? r.number : null,
          title: strip(r.hl_title),
          html_url: base && r.number != null ? `${base}/${seg}/${r.number}` : null,
          repo: repo ? `${repo.owner_login}/${repo.name}` : null,
          author: r.author_name || null,
          state: r.state || null,
          comments: r.num_comments != null ? r.num_comments : 0,
          created_at: r.created || null,
          labels: Array.isArray(r.labels) ? r.labels : []
        };
        if (isPr) item.merged = r.merged != null ? r.merged : null;
        out.push(item);
      }
    }
    return { result_count: payload.result_count != null ? payload.result_count : 0, results: out };
  }, type);
}

// ---- fallback extraction: DOM [data-testid="results-list"] (best-effort, mirrors shapes) ----
async function extractFromDOM(page, type) {
  return page.evaluate((t) => {
    const strip = (s) => (s == null ? null : s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const list = document.querySelector('[data-testid="results-list"]');
    if (!list) return { result_count: 0, results: [] };
    const out = [];
    for (const el of list.children) {
      const links = Array.from(el.querySelectorAll('a'));
      if (t === 'repositories') {
        const titleA = el.querySelector('a.search-title') ||
          links.find((a) => /^\/[\w.-]+\/[\w.-]+$/.test(a.getAttribute('href') || ''));
        const href = titleA ? titleA.getAttribute('href') : null;
        const sg = el.querySelector('a[href$="/stargazers"]');
        const lang = el.querySelector('[aria-label$=" language"]');
        const rt = el.querySelector('relative-time');
        const descEl = Array.from(el.children).find((c) => c.className && /Content/.test(c.className));
        out.push({
          full_name: href ? href.replace(/^\//, '') : null,
          html_url: href ? 'https://github.com' + href : null,
          description: descEl ? strip(descEl.textContent) : null,
          language: lang ? lang.getAttribute('aria-label').replace(/\s+language$/, '') : null,
          stars: sg ? parseInt((sg.getAttribute('aria-label') || '').replace(/[^\d]/g, ''), 10) || 0 : 0,
          updated_at: rt ? rt.getAttribute('datetime') : null,
          topics: [],
          archived: false
        });
      } else if (t === 'users') {
        const profileA = links.find((a) => /^\/[\w.-]+$/.test(a.getAttribute('href') || '') && a.getAttribute('href') !== '/sponsors');
        const href = profileA ? profileA.getAttribute('href') : null;
        const lines = (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
        out.push({
          login: href ? href.replace(/^\//, '') : null,
          name: lines[0] || null,
          html_url: href ? 'https://github.com' + href : null,
          bio: lines[2] || null,
          location: null,
          followers: 0,
          repos: 0
        });
      } else {
        const isPr = t === 'pull-requests';
        const issueA = links.find((a) => (/\/issues\/\d+$/.test(a.getAttribute('href') || '') || /\/pull\/\d+$/.test(a.getAttribute('href') || '')));
        const repoA = links.find((a) => /^\/[\w.-]+\/[\w.-]+$/.test(a.getAttribute('href') || ''));
        const href = issueA ? issueA.getAttribute('href') : null;
        const m = href ? href.match(/\/(\d+)$/) : null;
        const item = {
          number: m ? parseInt(m[1], 10) : null,
          title: issueA ? strip(issueA.textContent) : null,
          html_url: href ? 'https://github.com' + href : null,
          repo: repoA ? repoA.getAttribute('href').replace(/^\//, '') : null,
          author: null,
          state: null,
          comments: 0,
          created_at: null,
          labels: []
        };
        if (isPr) item.merged = null;
        out.push(item);
      }
    }
    return { result_count: 0, results: out };
  }, type);
}

export default async (page, params, cwd) => {
  // ---- Parameter validation (before any page access) ----
  const rawQuery = (params.query || '').trim();
  if (!rawQuery) {
    throw makeError('INVALID_PARAM', 'query is required: pass a search keyword, e.g. rust.');
  }

  const type = params.type || 'repositories';
  if (!(type in TYPE_URL)) {
    throw makeError('INVALID_PARAM', `invalid type '${params.type}': expected repositories (default) | users | issues | pull-requests.`);
  }
  const sort = params.sort || 'best-match';
  if (!(sort in SORT_PARAM)) {
    throw makeError('INVALID_PARAM', `invalid sort '${params.sort}': expected best-match (default) | stars | updated.`);
  }
  const limitRaw = params.limit;
  const limit = limitRaw === undefined || limitRaw === '' ? 10 : parseInt(limitRaw, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw makeError('INVALID_PARAM', `invalid limit '${params.limit}': expected an integer between 1 and 50.`);
  }

  // sort is only effective for repositories (GitHub ignores it for other types)
  const effectiveSort = type === 'repositories' ? sort : 'best-match';

  // ---- Build page-1 URL ----
  const baseUrl = `https://github.com/search?q=${encodeURIComponent(rawQuery)}&type=${TYPE_URL[type]}${type === 'repositories' ? SORT_PARAM[sort] : ''}`;

  const extractPage = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randSleep();
    let data = await extractFromEmbedded(page, type);
    if (data === null) {
      data = await extractFromDOM(page, type); // fallback
    }
    return data;
  };

  let data = await extractPage(baseUrl);
  let totalCount = data.result_count || 0;
  let collected = data.results || [];
  const maxPages = 100;

  if (collected.length === 0) {
    throw makeError('EMPTY_RESULT', `No ${type} results for '${rawQuery}'${effectiveSort !== 'best-match' ? ` with sort=${effectiveSort}` : ''}.`);
  }

  // ---- Serial pagination (?p=N, 10/page) until limit or end ----
  let pageNum = 1;
  while (collected.length < limit && pageNum < maxPages) {
    pageNum += 1;
    const nextUrl = `${baseUrl}&p=${pageNum}`;
    data = await extractPage(nextUrl);
    const more = data.results || [];
    if (more.length === 0) break;
    if (collected.some((r) => r.html_url && r.html_url === more[0].html_url)) break; // repeat/clamp guard
    collected.push(...more);
  }

  const truncated = collected.slice(0, limit);
  if (truncated.length === 0) {
    throw makeError('EMPTY_RESULT', `No ${type} results for '${rawQuery}'.`);
  }

  return {
    query: rawQuery,
    type,
    sort: effectiveSort,
    count: truncated.length,
    partial: truncated.length < limit,
    result_count: totalCount,
    results: truncated
  };
};
