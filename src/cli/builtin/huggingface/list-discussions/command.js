// huggingface/list-discussions — list open discussions of a HF model/dataset/Space repo.
// Browser runtime: reuse the user's Chrome network, fetch /api/{models|datasets|spaces}/{repo}/discussions in-page for JSON.
// Verified in explore: the list page is SSR, but the internal API returns structured JSON (50/page, `p` pagination,
// `limit`/`start` ignored, `status=open` includes drafts). Repo type is probed models -> datasets -> spaces.

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Accept org/name or a full URL; strip protocol/host and any trailing /discussions segment.
function normalizeRepo(raw) {
  let repo = String(raw || '').trim();
  if (!repo) return '';
  if (/^https?:\/\//i.test(repo)) {
    try {
      repo = new URL(repo).pathname;
    } catch (_) {
      // not a valid URL; keep the raw value
    }
  }
  repo = repo.replace(/^\/+/, '').replace(/\/discussions(\/.*)?$/, '').replace(/\/+$/, '');
  return repo;
}

const TYPE_ENDPOINTS = [
  { apiType: 'models', outType: 'model' },
  { apiType: 'datasets', outType: 'dataset' },
  { apiType: 'spaces', outType: 'space' }
];

export default async (page, params, cwd) => {
  // --- parameter validation (before any network call) ---
  const repo = normalizeRepo(params.repo);
  if (!repo) {
    const err = new Error('[MISSING_PARAM] repo is required: a HF repo id as org/name (e.g. deepseek-ai/DeepSeek-R1) or a full URL.');
    err.code = 'MISSING_PARAM';
    throw err;
  }
  if (repo.split('/').length < 2) {
    const err = new Error('[INVALID_PARAM] repo must be a HF repo id as org/name (e.g. deepseek-ai/DeepSeek-R1) or a full URL. It identifies a model, dataset, or Space repository.');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const limitRaw = params.limit;
  const limitStr = limitRaw === undefined || limitRaw === null ? '' : String(limitRaw);
  if (!/^\d+$/.test(limitStr)) {
    const err = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100, got: ' + limitRaw);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const limit = parseInt(limitStr, 10);
  if (limit < 1 || limit > 100) {
    const err = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100, got: ' + limitRaw);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // --- navigate once to establish the huggingface.co origin for in-page fetch ---
  try {
    await page.goto('https://huggingface.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    const err = new Error('[NETWORK_ERROR] Failed to reach huggingface.co from the browser: ' + e.message);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  // polite pacing: light random mouse movement, scroll, and wait (kept light, single call stays <=10s)
  try {
    await page.mouse.move(randInt(60, 320), randInt(120, 600));
    await page.mouse.move(randInt(340, 780), randInt(180, 540));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 320));
    });
  } catch (_) { /* non-fatal */ }
  await sleep(randInt(350, 900));

  // --- probe repo type: models -> datasets -> spaces (all 404 => NOT_FOUND) ---
  let matched = null;
  for (const t of TYPE_ENDPOINTS) {
    const url = 'https://huggingface.co/api/' + t.apiType + '/' + repo + '/discussions?status=open';
    let resp;
    try {
      resp = await page.evaluate(async (u) => {
        const res = await fetch(u, { headers: { accept: 'application/json' } });
        let body = null;
        try { body = await res.json(); } catch (_) { body = null; }
        return { ok: res.ok, status: res.status, body };
      }, url);
    } catch (e) {
      const err = new Error('[NETWORK_ERROR] In-page fetch to HF discussions API failed: ' + e.message);
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    if (resp && resp.ok && resp.body && typeof resp.body === 'object' && !resp.body.error) {
      matched = { apiType: t.apiType, outType: t.outType, data: resp.body };
      break;
    }
    await sleep(randInt(300, 700));
  }

  if (!matched) {
    const err = new Error('[NOT_FOUND] Repo not found (or has no accessible discussions API): ' + repo);
    err.code = 'NOT_FOUND';
    throw err;
  }

  // --- pagination: API returns 50/page fixed (limit/start ignored), uses p (0-based) ---
  // The probe result above is already page 0; reuse it, then fetch p=1.. if limit > 50.
  const pagesNeeded = Math.ceil(limit / 50);
  const collected = (Array.isArray(matched.data.discussions) ? matched.data.discussions : []).slice();
  for (let p = 1; p < pagesNeeded; p++) {
    const url = 'https://huggingface.co/api/' + matched.apiType + '/' + repo + '/discussions?status=open&p=' + p;
    let pageData;
    try {
      pageData = await page.evaluate(async (u) => {
        const res = await fetch(u, { headers: { accept: 'application/json' } });
        const body = await res.json();
        return { ok: res.ok, body };
      }, url);
    } catch (e) {
      const err = new Error('[NETWORK_ERROR] In-page fetch to HF discussions API failed: ' + e.message);
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    if (pageData && pageData.ok && pageData.body && Array.isArray(pageData.body.discussions)) {
      collected.push(...pageData.body.discussions);
      if (pageData.body.discussions.length < 50) break; // last page reached
    } else {
      break;
    }
    if (p < pagesNeeded - 1) await sleep(randInt(300, 700));
  }

  const items = collected.slice(0, limit).map((d) => {
    const itemType = d.repo && d.repo.type ? d.repo.type : matched.outType;
    const prefix = itemType === 'model' ? '' : itemType + 's' + '/';
    const name = d.repo && d.repo.name ? d.repo.name : repo;
    return {
      number: d.num,
      title: d.title,
      url: 'https://huggingface.co/' + prefix + name + '/discussions/' + d.num,
      author: d.author && d.author.name ? d.author.name : null,
      opened_at: d.createdAt || null,
      comments_count: typeof d.numComments === 'number' ? d.numComments : 0,
      status: d.status || null
    };
  });

  if (items.length === 0) {
    const err = new Error('[EMPTY_RESULT] No open discussions for repo ' + repo);
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  return {
    repo,
    type: matched.outType,
    count: items.length,
    total: typeof matched.data.count === 'number' ? matched.data.count : collected.length,
    items
  };
};
