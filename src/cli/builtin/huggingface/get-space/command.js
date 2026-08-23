// huggingface/get-space — fetch a single HF Space's full metadata by repo id.
// Browser runtime: reuse the user's Chrome network. Navigate to the Space page,
// then page-internal fetch('/api/spaces/{id}') returns the full detail JSON
// (id/author/likes/sdk/tags/subdomain/host/models/runtime/region/createdAt/lastModified/...).
// Command-line node/curl cannot reach huggingface.co; only the browser network works.

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bizError(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}

// Accept either "org/name" or a full space URL:
//   https://huggingface.co/spaces/multimodalart/minimax-h3
// Strips scheme/host, an optional /spaces/ prefix, and any query/hash.
function normalizeRepo(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) {
    throw bizError('MISSING_PARAM', 'repo is required: org/name (e.g. multimodalart/minimax-h3) or a full space URL');
  }
  if (/^https?:\/\//i.test(s)) {
    s = s.split(/[?#]/)[0]; // strip query/hash
    // Require the huggingface.co host so foreign URLs (e.g. example.com) are
    // rejected before any network call instead of being mis-normalized.
    const m = s.match(/^https?:\/\/(?:www\.)?huggingface\.co\/(?:spaces\/)?([^/]+\/[^/]+)\/?$/i);
    if (!m) {
      throw bizError('INVALID_PARAM', 'Invalid space URL: "' + raw + '". Expected https://huggingface.co/spaces/org/name');
    }
    return m[1];
  }
  if (!/^[^/]+\/[^/]+$/.test(s)) {
    throw bizError('INVALID_PARAM', 'repo must be org/name or a full space URL, got: "' + raw + '"');
  }
  return s;
}

export default async (page, params, cwd) => {
  const id = normalizeRepo(params.repo);

  // --- polite pacing: light random mouse movement, scroll, and wait (not perceptibly slow) ---
  const gentle = async (waitMs) => {
    await page.mouse.move(randInt(60, 320), randInt(120, 600));
    await page.mouse.move(randInt(340, 780), randInt(180, 540));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 300));
    });
    await sleep(randInt(waitMs, waitMs + 400));
  };

  // Navigate to the Space page (same origin as the API), then fetch the detail JSON.
  await page.goto('https://huggingface.co/spaces/' + id, { waitUntil: 'domcontentloaded' });
  await gentle(300);

  const result = await page.evaluate(async (spaceId) => {
    const res = await fetch('/api/spaces/' + spaceId, { headers: { accept: 'application/json' } });
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
  }, id);

  if (result.error) {
    if (result.status === 404) {
      throw bizError('NOT_FOUND', 'Space not found: ' + id);
    }
    if (result.status === 429) {
      throw bizError('RATE_LIMITED', 'Hugging Face rate-limited the request (HTTP 429). Try again later.');
    }
    throw bizError('NETWORK_ERROR', 'Failed to fetch /api/spaces/' + id + ': ' + result.error + ' (HTTP ' + result.status + ')');
  }

  // Pass through the full Space detail JSON (incl. nested runtime object and linked models).
  return result.data;
};
