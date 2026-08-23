// github/list-repos — list a GitHub user's or organization's public repositories.
// browser runtime. Reads the rendered repositories tab; no login required.

// type: user-tab URL param mapping / org-tab q-filter token mapping
const TYPE_USER = { owner: 'source', fork: 'fork', member: 'all' };
const TYPE_ORG = { owner: 'mirror:false fork:false archived:false', fork: 'fork:true', member: '' };
// sort: user-tab URL param mapping / org-tab q-sort token mapping.
// org updated/created use '' (no sort token) because the org page's default order is already "Last pushed".
const SORT_USER = { stars: 'stargazers', updated: 'updated', created: 'updated', name: 'name' };
const SORT_ORG = { stars: 'sort:stars', updated: '', created: '', name: 'sort:name-asc' };

const PAGE_SIZE = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSleep = (min = 200, max = 700) => sleep(min + Math.floor(Math.random() * (max - min)));

function makeError(code, message) {
  const e = new Error(`[${code}] ${message}`);
  e.code = code;
  return e;
}

// ---- user tab extraction ----
async function extractUserCards(page) {
  return page.evaluate(() => {
    const parseCount = (txt) => {
      if (!txt) return 0;
      const t = String(txt).replace(/,/g, '').trim();
      const m = t.match(/^([\d.]+)\s*([kmb])?$/i);
      if (!m) return parseInt(t, 10) || 0;
      const base = parseFloat(m[1]);
      const mult = m[2] ? { k: 1000, m: 1000000, b: 1000000000 }[m[2].toLowerCase()] : 1;
      return Math.round(base * mult);
    };
    const list = document.querySelector('#user-repositories-list');
    if (!list) return null;
    const out = [];
    for (const li of list.querySelectorAll('li')) {
      const nameA = li.querySelector('a[itemprop="name codeRepository"]');
      if (!nameA) continue;
      const desc = li.querySelector('p[itemprop="description"]');
      const meta = li.querySelector('.f6.color-fg-muted.mt-2');
      const starsA = li.querySelector('a[href$="/stargazers"]');
      const forksA = li.querySelector('a[href$="/forks"]');
      const rt = li.querySelector('relative-time');
      const cls = li.className || '';
      const octo = li.querySelector('[data-octo-dimensions]');
      let language = null;
      if (meta) {
        const langSpan = Array.from(meta.querySelectorAll('span')).find((s) => s.querySelector('.repo-language-color'));
        if (langSpan) language = langSpan.textContent.trim();
      }
      const href = nameA.getAttribute('href');
      out.push({
        full_name: href.replace(/^\//, ''),
        html_url: 'https://github.com' + href,
        description: desc ? (desc.textContent || '').trim() : null,
        language,
        stars: parseCount(starsA ? starsA.textContent : null),
        forks: parseCount(forksA ? forksA.textContent : null),
        fork: /\bfork\b/.test(cls) || (octo ? /repository_is_fork:true/.test(octo.getAttribute('data-octo-dimensions') || '') : false),
        archived: /\barchived\b/.test(cls),
        updated_at: rt ? rt.getAttribute('datetime') : null
      });
    }
    return out;
  });
}

// ---- org tab extraction ----
async function extractOrgCards(page, user, type) {
  return page.evaluate((args) => {
    const prefix = args.prefix;
    const typeArg = args.typeArg;
    const parseCount = (txt) => {
      if (!txt) return 0;
      const t = String(txt).replace(/,/g, '').trim();
      const m = t.match(/^([\d.]+)\s*([kmb])?$/i);
      if (!m) return parseInt(t, 10) || 0;
      const base = parseFloat(m[1]);
      const mult = m[2] ? { k: 1000, m: 1000000, b: 1000000000 }[m[2].toLowerCase()] : 1;
      return Math.round(base * mult);
    };
    const out = [];
    for (const li of Array.from(document.querySelectorAll('li'))) {
      const nameA = li.querySelector(`h4 a[href^="${prefix}"]`);
      if (!nameA) continue;
      const descEl = li.querySelector('.repos-list-description');
      const langEl = li.querySelector('span[class*="PrimaryLanguageName"]');
      const starsA = li.querySelector('a[href$="/stargazers"]');
      const forksA = li.querySelector('a[href$="/forks"]');
      const rt = li.querySelector('relative-time');
      const visLabel = li.querySelector('[data-listview-item-visibility-label]');
      const href = nameA.getAttribute('href');
      const text = li.textContent;
      out.push({
        full_name: href.replace(/^\//, ''),
        html_url: 'https://github.com' + href,
        description: descEl ? (descEl.getAttribute('title') || descEl.textContent.trim()) : null,
        language: langEl ? langEl.textContent.trim() : null,
        stars: parseCount(starsA ? starsA.textContent : null),
        forks: parseCount(forksA ? forksA.textContent : null),
        fork: typeArg === 'fork' ? true : typeArg === 'owner' ? false : /forked from/i.test(text),
        archived: visLabel ? /archived/i.test(visLabel.textContent) : /archived/i.test(text),
        updated_at: rt ? rt.getAttribute('datetime') : null
      });
    }
    return out.length ? out : null;
  }, { prefix: `/${user}/`, typeArg: type });
}

export default async (page, params, cwd) => {
  // ---- Parameter validation (before any page access) ----
  const rawUser = (params.user || '').trim();
  const user = rawUser
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^orgs\//, '')
    .replace(/\/$/, '')
    .replace(/\?.*$/, '');
  if (!user) {
    throw makeError('INVALID_PARAM', 'user is required: pass a GitHub username or organization name (e.g. facebook).');
  }
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(user)) {
    throw makeError('INVALID_PARAM', `invalid user '${rawUser}': GitHub usernames may contain only letters, digits and single hyphens.`);
  }

  const type = params.type || 'owner';
  if (!(type in TYPE_USER)) {
    throw makeError('INVALID_PARAM', `invalid type '${params.type}': expected owner (default) | fork | member.`);
  }
  const sort = params.sort || 'stars';
  if (!(sort in SORT_USER)) {
    throw makeError('INVALID_PARAM', `invalid sort '${params.sort}': expected stars (default) | updated | created | name.`);
  }
  const limitRaw = params.limit;
  const limit = limitRaw === undefined || limitRaw === '' ? 20 : parseInt(limitRaw, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw makeError('INVALID_PARAM', `invalid limit '${params.limit}': expected an integer between 1 and 100.`);
  }

  // ---- Navigate: user tab first; org profiles 302 to the bare page and must use /orgs/ path ----
  const userTabUrl = `https://github.com/${user}?tab=repositories&type=${TYPE_USER[type]}&sort=${SORT_USER[sort]}`;
  await page.goto(userTabUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randSleep();

  if ((await page.title()).includes('Page not found')) {
    throw makeError('NOT_FOUND', `GitHub user or organization '${user}' not found.`);
  }

  let isOrg = !page.url().includes('tab=repositories');
  let orgQs = null;
  if (isOrg) {
    const q = TYPE_ORG[type];
    const sortToken = SORT_ORG[sort];
    orgQs = sortToken ? `${sortToken}${q ? ' ' + q : ''}` : q;
    await page.goto(`https://github.com/orgs/${user}/repositories?q=${encodeURIComponent(orgQs)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await randSleep();
    if ((await page.title()).includes('Page not found')) {
      throw makeError('NOT_FOUND', `GitHub user or organization '${user}' not found.`);
    }
  }

  // ---- Wait for the repo list to be present (or settle as empty) ----
  const listSel = isOrg ? `li h4 a[href^="/${user}/"]` : '#user-repositories-list li';
  try {
    await page.waitForSelector(listSel, { timeout: 15000 });
  } catch (e) {
    // list may be genuinely empty (0 matching repos) — handled as EMPTY_RESULT below
  }

  // ---- Extract cards ----
  const cards = isOrg
    ? await extractOrgCards(page, user, type)
    : await extractUserCards(page);

  if (cards === null) {
    throw makeError('EMPTY_RESULT', `No repositories found for '${user}' with type=${type}, sort=${sort}.`);
  }

  // ---- Pagination (serial, ?page=N, 30/page) until limit or end ----
  const collected = [...cards];
  let pageNum = 1;
  const maxPages = Math.ceil(limit / PAGE_SIZE) + 1;
  while (collected.length < limit && pageNum < maxPages) {
    pageNum += 1;
    const nextUrl = isOrg
      ? `https://github.com/orgs/${user}/repositories?q=${encodeURIComponent(orgQs)}&page=${pageNum}`
      : `https://github.com/${user}?tab=repositories&type=${TYPE_USER[type]}&sort=${SORT_USER[sort]}&page=${pageNum}`;
    await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randSleep();
    if ((await page.title()).includes('Page not found')) break;
    const more = isOrg ? await extractOrgCards(page, user, type) : await extractUserCards(page);
    if (more === null || more.length === 0) break;
    if (collected.some((r) => r.full_name === more[0].full_name)) break; // clamped/repeat guard
    collected.push(...more);
  }

  const truncated = collected.slice(0, limit);
  if (truncated.length === 0) {
    throw makeError('EMPTY_RESULT', `No repositories found for '${user}' with type=${type}, sort=${sort}.`);
  }

  return {
    user,
    type,
    sort,
    count: truncated.length,
    partial: truncated.length < limit,
    repositories: truncated
  };
};
