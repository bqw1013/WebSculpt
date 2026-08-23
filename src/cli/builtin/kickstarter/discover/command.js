const VALID_SORTS = ['magic', 'popularity', 'newest', 'end_date', 'most_funded', 'most_backed'];
const VALID_STATES = ['upcoming', 'live', 'successful', 'late_pledge'];
const DEFAULT_STATES = ['upcoming', 'live', 'late_pledge'];
const MAX_LIMIT = 100;
const MAX_PAGE_SIZE = 48;

const CF_REGEX = /Just a moment|cf_chl_opt|challenges\.cloudflare\.com/i;
const CAPTCHA_REGEX = /验证码|captcha|geetest|滑块.*验证|请完成安全验证/i;

function codedError(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}

function throwIf(raw) {
  if (!raw.ok) {
    throw codedError(raw.reason, raw.message);
  }
}

function projectToOutput(p) {
  const creator = p.creator || null;
  const avatar = creator && creator.avatar
    ? (creator.avatar.thumb || creator.avatar.small || creator.avatar.medium || null)
    : null;
  return {
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    slug: p.slug,
    url: p.urls && p.urls.web && p.urls.web.project ? p.urls.web.project : null,
    photo_full: p.photo && p.photo.full ? p.photo.full : null,
    state: p.state,
    goal: p.goal,
    pledged: p.pledged,
    percent_funded: p.percent_funded,
    backers_count: p.backers_count,
    currency: p.currency,
    deadline: p.deadline,
    launched_at: p.launched_at,
    staff_pick: p.staff_pick,
    prelaunch_activated: p.prelaunch_activated,
    creator: creator ? { name: creator.name, slug: creator.slug, avatar } : null,
    category: p.category ? {
      id: p.category.id,
      slug: p.category.slug,
      parent_name: p.category.parent_name
    } : null,
    location: p.location ? {
      displayable_name: p.location.displayable_name,
      country: p.location.country,
      state: p.location.state
    } : null
  };
}

// Resolve a category/subcategory slug to the numeric id used by /discover/advanced.json.
// Resolved via one in-page /graph rootCategories query. childSlug is resolved within parentSlug's
// children when parentSlug is given (subcategory slugs collide across top-level categories).
// /graph returns ids as base64 of "Category-<n>" (e.g. "Q2F0ZWdvcnktMzMx" = "Category-331"),
// so decode in-page (browser has atob; pad to a multiple of 4) before extracting <n>.
async function resolveCategoryId(page, csrfToken, parentSlug, childSlug) {
  const raw = await page.evaluate(async (arg) => {
    const decodeId = (id) => {
      let b = id;
      while (b.length % 4 !== 0) b += '=';
      let decoded = '';
      try {
        decoded = atob(b);
      } catch (e) {
        return NaN;
      }
      const m = decoded.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : NaN;
    };
    const query = {
      operationName: 'rootCategories',
      variables: {},
      query: 'query rootCategories { rootCategories { id name slug subcategories { nodes { id name slug } } } }'
    };
    let resp;
    try {
      resp = await fetch('/graph', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': arg.token,
          'Referer': location.href
        },
        body: JSON.stringify(query)
      });
    } catch (e) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: '/graph request failed: ' + e.message };
    }
    const text = await resp.text();
    if (/Just a moment|cf_chl_opt|challenges\.cloudflare\.com/i.test(text)) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: 'Cloudflare challenge on /graph' };
    }
    if (resp.status === 429) {
      return { ok: false, reason: 'RATE_LIMITED', message: 'Kickstarter rate limit (HTTP 429)' };
    }
    if (!resp.ok) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: '/graph HTTP ' + resp.status };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'DRIFT_DETECTED', message: 'non-JSON response from /graph' };
    }
    if (json.errors) {
      return { ok: false, reason: 'DRIFT_DETECTED', message: '/graph returned field errors' };
    }
    const cats = (json.data && json.data.rootCategories) || [];
    if (arg.parentSlug) {
      const parent = cats.find((c) => c.slug === arg.parentSlug);
      if (!parent) {
        return { ok: false, reason: 'INVALID_PARAM', message: 'Unknown category slug: ' + arg.parentSlug };
      }
      const child = parent.subcategories.nodes.find((s) => s.slug === arg.childSlug);
      if (!child) {
        return { ok: false, reason: 'INVALID_PARAM', message: 'Unknown subcategory slug "' + arg.childSlug + '" under category "' + arg.parentSlug + '"' };
      }
      const num = decodeId(child.id);
      if (!num) {
        return { ok: false, reason: 'DRIFT_DETECTED', message: 'Could not decode category id for subcategory "' + arg.childSlug + '"' };
      }
      return { ok: true, id: num };
    }
    const top = cats.find((c) => c.slug === arg.childSlug);
    if (!top) {
      return { ok: false, reason: 'INVALID_PARAM', message: 'Unknown category slug: ' + arg.childSlug };
    }
    const num = decodeId(top.id);
    if (!num) {
      return { ok: false, reason: 'DRIFT_DETECTED', message: 'Could not decode category id for category "' + arg.childSlug + '"' };
    }
    return { ok: true, id: num };
  }, { token: csrfToken, parentSlug: parentSlug || null, childSlug: childSlug });
  return raw;
}

// Fetch one page of /discover/advanced.json in-page. Returns { ok, data } or { ok:false, reason, message }.
async function fetchDiscoverPage(page, queryString) {
  return page.evaluate(async (qs) => {
    let resp;
    try {
      resp = await fetch('/discover/advanced.json?' + qs, { credentials: 'include' });
    } catch (e) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: 'advanced.json request failed: ' + e.message };
    }
    const text = await resp.text();
    if (/Just a moment|cf_chl_opt|challenges\.cloudflare\.com/i.test(text)) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: 'Cloudflare challenge on advanced.json' };
    }
    if (resp.status === 429) {
      return { ok: false, reason: 'RATE_LIMITED', message: 'Kickstarter rate limit (HTTP 429)' };
    }
    if (!resp.ok) {
      return { ok: false, reason: 'PLATFORM_BLOCKED', message: '/discover/advanced.json HTTP ' + resp.status };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'DRIFT_DETECTED', message: 'non-JSON response from advanced.json' };
    }
    return { ok: true, data: json };
  }, queryString);
}

function buildQueryString({ term, categoryId, sort, states, staffPicks, pageSize, page, seed }) {
  const sp = new URLSearchParams();
  if (term) sp.set('term', term);
  if (categoryId) sp.set('category_id', String(categoryId));
  sp.set('sort', sort);
  for (const s of states) sp.append('state[]', s);
  if (staffPicks) sp.set('staff_picks', 'true');
  sp.set('per_page', String(pageSize));
  sp.set('page', String(page));
  if (seed) sp.set('seed', String(seed));
  return sp.toString();
}

export default async (page, params, cwd) => {
  const term = params.term || '';
  const category = params.category || '';
  const subcategory = params.subcategory || '';
  const sort = params.sort || 'magic';
  const stateRaw = params.state || '';
  const staffPicks = params.staff_picks === 'true';
  const limitRaw = params.limit || '12';

  // --- validate limit ---
  const limitNum = parseInt(limitRaw, 10);
  if (!/^\d+$/.test(limitRaw) || isNaN(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    throw codedError('INVALID_PARAM', 'limit must be an integer between 1 and ' + MAX_LIMIT + ', got "' + limitRaw + '"');
  }

  // --- validate sort ---
  if (VALID_SORTS.indexOf(sort) === -1) {
    throw codedError('INVALID_PARAM', 'sort must be one of ' + VALID_SORTS.join(', ') + ', got "' + sort + '"');
  }

  // --- validate state(s) ---
  let states;
  if (stateRaw === '') {
    states = DEFAULT_STATES;
  } else {
    states = stateRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (states.length === 0) {
      throw codedError('INVALID_PARAM', 'state must be a comma-separated list of ' + VALID_STATES.join(', '));
    }
  }
  for (const s of states) {
    if (VALID_STATES.indexOf(s) === -1) {
      throw codedError('INVALID_PARAM', 'state value "' + s + '" invalid; must be one of ' + VALID_STATES.join(', '));
    }
  }

  // --- subcategory requires category ---
  if (subcategory && !category) {
    throw codedError('INVALID_PARAM', 'subcategory must be used together with its parent category');
  }

  // --- navigate to homepage for same-origin context + _ksr_session cookie ---
  await page.goto('https://www.kickstarter.com/', { waitUntil: 'domcontentloaded' });

  const homeCheck = await page.evaluate(() => ({
    url: location.href,
    html: document.body ? document.body.innerHTML.slice(0, 400) : '',
    csrf: (document.querySelector('meta[name="csrf-token"]') || {}).content || null
  }));

  if (!homeCheck.url || homeCheck.url.indexOf('kickstarter.com') === -1) {
    throw codedError('PLATFORM_BLOCKED', 'Failed to reach kickstarter.com; landed on ' + (homeCheck.url || 'empty'));
  }
  if (CF_REGEX.test(homeCheck.html) || CAPTCHA_REGEX.test(homeCheck.html)) {
    throw codedError('PLATFORM_BLOCKED', 'Cloudflare challenge or CAPTCHA on kickstarter.com homepage');
  }

  // --- resolve category/subcategory slugs to numeric category_id (only when needed) ---
  let categoryId = null;
  if (category) {
    let raw;
    if (subcategory) {
      raw = await resolveCategoryId(page, homeCheck.csrf, category, subcategory);
    } else {
      raw = await resolveCategoryId(page, homeCheck.csrf, null, category);
    }
    throwIf(raw);
    categoryId = raw.id;
  }

  // --- paginate advanced.json until limit or exhaustion ---
  const pageSize = Math.min(limitNum, MAX_PAGE_SIZE);
  const projects = [];
  const seen = new Set();
  let pageNo = 1;
  let seed = null;
  let totalHits = 0;
  let hasMore = true;

  while (projects.length < limitNum && hasMore) {
    const qs = buildQueryString({ term, categoryId, sort, states, staffPicks, pageSize, page: pageNo, seed });
    const raw = await fetchDiscoverPage(page, qs);
    throwIf(raw);
    const data = raw.data;
    if (pageNo === 1) {
      totalHits = typeof data.total_hits === 'number' ? data.total_hits : 0;
      if (data.seed) seed = data.seed;
    }
    const items = Array.isArray(data.projects) ? data.projects : [];
    for (const p of items) {
      if (projects.length >= limitNum) break;
      if (p && typeof p.id !== 'undefined' && !seen.has(p.id)) {
        seen.add(p.id);
        projects.push(projectToOutput(p));
      }
    }
    hasMore = !!data.has_more;
    if (hasMore && items.length > 0 && projects.length < limitNum) {
      pageNo += 1;
    } else {
      break;
    }
    if (pageNo > 30) break; // safety against runaway pagination
  }

  const finalProjects = projects.slice(0, limitNum);
  const partial = finalProjects.length < limitNum;

  return { projects: finalProjects, total_hits: totalHits, partial };
};
