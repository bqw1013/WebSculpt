// huggingface/get-dataset — fetch a HF dataset's full metadata by repo id.
// Browser runtime: reuse the user's Chrome network; navigate once to huggingface.co,
// then fetch /api/datasets/{id} in-page for the complete JSON.

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}

// Normalize the repo param to "org/name".
// Accepts "org/name" or a full URL https://huggingface.co/datasets/org/name
// (also http://, www., trailing slash). Returns null when not normalizable.
function normalizeRepo(raw) {
  const s = (raw || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  // Full URL form: strip protocol, optional www, domain, and the /datasets/ prefix.
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?huggingface\.co\/datasets\/([^/?#]+\/[^/?#]+)/i);
  if (m) return m[1];
  // Plain org/name form.
  m = s.match(/^([^/?#]+\/[^/?#]+)$/);
  if (m) return m[1];
  return null;
}

function isValidId(id) {
  if (!id || typeof id !== 'string') return false;
  const parts = id.split('/');
  if (parts.length !== 2) return false;
  return parts.every((p) => /^[\w.-]+$/.test(p));
}

export default async (page, params, cwd) => {
  // --- parameter validation (before any network call) ---
  const repoRaw = (params.repo || '').trim();
  if (!repoRaw) {
    throw fail('MISSING_PARAM', 'repo is required: org/name (e.g. HuggingFaceFW/fineweb) or full URL (https://huggingface.co/datasets/HuggingFaceFW/fineweb).');
  }
  const id = normalizeRepo(repoRaw);
  if (!id || !isValidId(id)) {
    throw fail('INVALID_PARAM', 'repo must be org/name (e.g. HuggingFaceFW/fineweb) or a full HF dataset URL (https://huggingface.co/datasets/HuggingFaceFW/fineweb), got: ' + repoRaw);
  }
  const encodedId = id.split('/').map(encodeURIComponent).join('/');

  // --- navigate once to establish the huggingface.co origin ---
  try {
    await page.goto('https://huggingface.co/datasets/' + encodedId, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    throw fail('NETWORK_ERROR', 'Failed to reach huggingface.co from the browser: ' + e.message);
  }

  // polite pacing: short random mouse movement, scroll, and wait (kept light, not noticeably slow)
  try {
    await page.mouse.move(randInt(60, 320), randInt(120, 600));
    await page.mouse.move(randInt(340, 780), randInt(180, 540));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 320));
    });
  } catch (_) { /* non-fatal */ }
  await sleep(randInt(350, 900));

  // --- fetch the HF internal dataset API in-page (reuses browser network) ---
  const apiUrl = 'https://huggingface.co/api/datasets/' + encodedId;
  let result;
  try {
    result = await page.evaluate(async (url) => {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        return { error: 'JSON parse failed', status: res.status };
      }
      if (!res.ok) {
        const msg = body && body.error ? body.error : 'HTTP ' + res.status;
        return { error: msg, status: res.status };
      }
      return { data: body, status: res.status };
    }, apiUrl);
  } catch (e) {
    throw fail('NETWORK_ERROR', 'In-page fetch to HF dataset API failed: ' + e.message);
  }

  if (!result.data) {
    if (result.status === 404) {
      throw fail('NOT_FOUND', 'Dataset not found: ' + id);
    }
    throw fail('NETWORK_ERROR', result.error + ' (HTTP ' + result.status + ')');
  }

  const d = result.data;
  if (!d || typeof d.id !== 'string' || d.id.length === 0) {
    throw fail('DRIFT_DETECTED', 'Unexpected /api/datasets/{id} response shape (missing id).');
  }

  // --- pass through all verified fields ---
  return {
    id: d.id,
    author: d.author !== undefined ? d.author : null,
    sha: d.sha !== undefined ? d.sha : null,
    downloads: d.downloads !== undefined ? d.downloads : null,
    likes: d.likes !== undefined ? d.likes : null,
    private: d.private !== undefined ? d.private : null,
    gated: d.gated !== undefined ? d.gated : null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    description: d.description !== undefined ? d.description : null,
    cardData: d.cardData !== undefined ? d.cardData : null,
    siblings: Array.isArray(d.siblings) ? d.siblings : [],
    createdAt: d.createdAt !== undefined ? d.createdAt : null,
    lastModified: d.lastModified !== undefined ? d.lastModified : null,
    usedStorage: d.usedStorage !== undefined ? d.usedStorage : null
  };
};
