// huggingface/get-model — fetch a single HF model's full metadata (+ optional README).
// Browser runtime: reuse the user's Chrome network, in-page fetch of HF internal API.
// Explore-verified: /api/models/{id} returns full JSON; README via /{id}/raw/main/README.md
// (NOT /api/models/{id}/readme — that endpoint returns 404).

function makeError(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Accept "org/name" or a full "https://huggingface.co/org/name[/...]" URL.
function normalizeRepo(raw) {
  let s = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!s) throw makeError('MISSING_PARAM', 'repo parameter is required (org/name or full https://huggingface.co/{org}/{name} URL)');
  const urlMatch = s.match(/^https?:\/\/huggingface\.co\/(.+)$/i);
  if (urlMatch) s = urlMatch[1];
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw makeError('INVALID_PARAM', 'repo must be org/name (e.g. deepseek-ai/DeepSeek-R1) or a full https://huggingface.co/{org}/{name} URL, got: ' + raw);
  }
  return parts[0] + '/' + parts[1];
}

export default async (page, params, cwd) => {
  const repoId = normalizeRepo(params.repo);
  const includeReadme = params.include_readme === 'true';

  // --- navigate once to establish huggingface.co origin, then fetch the API in-page ---
  try {
    await page.goto('https://huggingface.co/models', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    throw makeError('NETWORK_ERROR', 'Failed to reach huggingface.co from the browser: ' + e.message);
  }

  // polite pacing: light random mouse movement, scroll, and wait (not noticeably slow)
  try {
    await page.mouse.move(randInt(60, 320), randInt(120, 600));
    await page.mouse.move(randInt(340, 780), randInt(180, 540));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 320));
    });
  } catch (_) { /* non-fatal */ }
  await sleep(randInt(250, 700));

  // --- 1. model metadata ---
  let model;
  try {
    model = await page.evaluate(async (rid) => {
      const res = await fetch('/api/models/' + rid, { headers: { accept: 'application/json' } });
      if (res.status === 404) {
        let reason = '';
        try { reason = JSON.stringify(await res.json()); } catch (_) { reason = await res.text(); }
        return { status: res.status, reason };
      }
      if (!res.ok) {
        let reason = '';
        try { reason = JSON.stringify(await res.json()); } catch (_) { reason = await res.text(); }
        return { status: res.status, reason };
      }
      const j = await res.json();
      return { status: res.status, data: j };
    }, repoId);
  } catch (e) {
    throw makeError('NETWORK_ERROR', 'In-page fetch to HF model API failed: ' + e.message);
  }

  if (model.status === 404) {
    throw makeError('NOT_FOUND', 'Model ' + repoId + ' not found (' + (model.reason || 'Repository not found') + ')');
  }
  if (model.status !== 200 || !model.data) {
    throw makeError('NETWORK_ERROR', 'HF model API returned HTTP ' + model.status + (model.reason ? ': ' + model.reason : ''));
  }

  const d = model.data;
  const out = {
    id: d.id,
    url: 'https://huggingface.co/' + repoId,
    author: d.author,
    sha: d.sha !== undefined ? d.sha : null,
    downloads: d.downloads !== undefined ? d.downloads : null,
    likes: d.likes !== undefined ? d.likes : null,
    private: d.private !== undefined ? d.private : null,
    gated: d.gated !== undefined ? d.gated : null,
    pipeline_tag: d.pipeline_tag !== undefined ? d.pipeline_tag : null,
    library_name: d.library_name !== undefined ? d.library_name : null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    cardData: d.cardData !== undefined ? d.cardData : null,
    safetensors: d.safetensors !== undefined ? d.safetensors : null,
    siblings: Array.isArray(d.siblings) ? d.siblings : [],
    spaces: Array.isArray(d.spaces) ? d.spaces : [],
    createdAt: d.createdAt !== undefined ? d.createdAt : null,
    lastModified: d.lastModified !== undefined ? d.lastModified : null
  };

  // --- 2. optional README ---
  if (includeReadme) {
    try {
      await page.mouse.move(randInt(100, 420), randInt(140, 620));
    } catch (_) { /* non-fatal */ }
    await sleep(randInt(250, 650));

    let rd;
    try {
      rd = await page.evaluate(async (rid) => {
        const res = await fetch('/' + rid + '/raw/main/README.md');
        const text = await res.text();
        return { status: res.status, text };
      }, repoId);
    } catch (e) {
      throw makeError('NETWORK_ERROR', 'In-page fetch of model README failed: ' + e.message);
    }

    if (rd.status === 200) {
      out.readme = rd.text;
    } else {
      out.readme = null;
      out.readmeError = {
        status: rd.status,
        reason: (rd.text || '').slice(0, 500)
      };
    }
  }

  return out;
};
