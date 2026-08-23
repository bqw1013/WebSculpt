// huggingface/search — cross-type keyword search over Hugging Face models/datasets/spaces.
// browser runtime. Navigates to huggingface.co (any origin page enables same-origin fetch),
// then fetches the HF list APIs in-page (/api/models, /api/datasets, /api/spaces) with the
// ?search= keyword filter and merges the results. type=all merges the three APIs; a single
// type queries only that API. limit caps results per type. No login required.
// Polite pacing: random mouse move + random scroll + jittered delays around the fetch batch.

const TYPE_ENDPOINT = {
  model: '/api/models',
  dataset: '/api/datasets',
  space: '/api/spaces',
};

// Model URLs are canonical at https://huggingface.co/{org}/{name} (no /models/
// prefix — /models/{id} returns HTTP 404). Datasets/spaces keep their /datasets/
// and /spaces/ path prefixes.
const TYPE_PATH = {
  dataset: 'datasets',
  space: 'spaces',
};

const VALID_TYPES = ['all', 'model', 'dataset', 'space'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSleep = (min = 150, max = 400) => sleep(min + Math.floor(Math.random() * (max - min)));

function makeError(code, message) {
  const e = new Error(`[${code}] ${message}`);
  e.code = code;
  return e;
}

// Normalize one list-API item into the output shape (runs in Node scope).
function normalizeItem(type, x) {
  const id = x && x.id ? x.id : null;
  const item = {
    type,
    id,
    url: type === 'model'
      ? `https://huggingface.co/${id}`
      : `https://huggingface.co/${TYPE_PATH[type]}/${id}`,
    likes: x && typeof x.likes === 'number' ? x.likes : 0,
    downloads: x && typeof x.downloads === 'number' ? x.downloads : 0,
    tags: x && Array.isArray(x.tags) ? x.tags.slice(0, 8) : [],
  };
  if (type === 'model') item.pipeline_tag = x && x.pipeline_tag ? x.pipeline_tag : null;
  if (type === 'space') item.sdk = x && x.sdk ? x.sdk : null;
  return item;
}

export default async (page, params, cwd) => {
  // ---- Parameter validation (before any page access) ----
  const query = (params.query || '').trim();
  if (!query) {
    throw makeError('MISSING_PARAM', 'query is required: pass a search keyword, e.g. "vision transformer".（搜索关键词必填。）');
  }

  const type = params.type === undefined || params.type === null ? 'all' : params.type;
  if (!VALID_TYPES.includes(type)) {
    throw makeError('INVALID_PARAM', `invalid type '${params.type}': expected all(全部) | model(模型) | dataset(数据集) | space(Space).`);
  }

  const limitRaw = params.limit;
  const limitStr = limitRaw === undefined || limitRaw === null ? '' : String(limitRaw);
  if (!/^\d+$/.test(limitStr)) {
    throw makeError('INVALID_PARAM', `invalid limit '${params.limit}': expected an integer between 1 and 100 (default 20).`);
  }
  const limit = parseInt(limitStr, 10);
  if (limit < 1 || limit > 100) {
    throw makeError('INVALID_PARAM', `invalid limit '${params.limit}': expected an integer between 1 and 100 (default 20).`);
  }

  // ---- Navigate to huggingface.co so same-origin fetch of /api/... works ----
  try {
    await page.goto('https://huggingface.co/models', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    throw makeError('NETWORK_ERROR', `Failed to reach huggingface.co from the browser: ${e.message}`);
  }

  // ---- Polite pacing: random mouse move + random scroll + random wait (kept light, <1s) ----
  try {
    await page.mouse.move(80 + Math.floor(Math.random() * 640), 80 + Math.floor(Math.random() * 400));
    await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300)));
  } catch (_) { /* non-fatal */ }
  await randSleep();

  // ---- Which list APIs to query ----
  const targets = type === 'all' ? ['model', 'dataset', 'space'] : [type];
  const encoded = encodeURIComponent(query);
  const urls = targets.map((t) => `${TYPE_ENDPOINT[t]}?search=${encoded}&limit=${limit}`);

  // ---- Fetch list APIs in-page (concurrent, jittered stagger for polite pacing) ----
  let raw;
  try {
    raw = await page.evaluate(async (fetchUrls) => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const results = await Promise.all(fetchUrls.map(async (url) => {
        await delay(Math.floor(Math.random() * 300));
        const resp = await fetch(url);
        if (!resp.ok) return { __httpError: resp.status };
        return resp.json();
      }));
      return results;
    }, urls);
  } catch (e) {
    throw makeError('NETWORK_ERROR', `In-page fetch to HF list API failed: ${e.message}`);
  }

  if (!Array.isArray(raw) || raw.length !== targets.length) {
    throw makeError('NETWORK_ERROR', 'Unexpected response shape from HF list API.');
  }

  // ---- Merge results (models -> datasets -> spaces for type=all) ----
  const items = [];
  let httpError = null;
  targets.forEach((t, i) => {
    const r = raw[i];
    if (r && typeof r === 'object' && r.__httpError) {
      httpError = r.__httpError;
      return;
    }
    if (Array.isArray(r)) {
      for (const x of r) items.push(normalizeItem(t, x));
    }
  });

  if (httpError) {
    throw makeError('NETWORK_ERROR', `HF list API returned HTTP ${httpError}.`);
  }

  if (items.length === 0) {
    throw makeError('EMPTY_RESULT', `No results for query "${query}" in type=${type}.`);
  }

  return { query, type, items, count: items.length };
};
