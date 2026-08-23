// huggingface/list-models — list HF models with pipeline_tag/sort/search/author filters.
// Browser runtime: reuse the user's Chrome network, fetch /api/models in-page for JSON.

const PIPELINE_TAGS = new Set([
  'any-to-any', 'audio-text-to-text', 'document-question-answering', 'visual-document-retrieval',
  'image-text-to-text', 'image-text-to-image', 'image-text-to-video', 'video-text-to-text',
  'visual-question-answering', 'feature-extraction', 'fill-mask', 'question-answering',
  'sentence-similarity', 'summarization', 'table-question-answering', 'text-classification',
  'text-generation', 'text-ranking', 'token-classification', 'translation',
  'zero-shot-classification', 'depth-estimation', 'image-classification', 'image-feature-extraction',
  'image-segmentation', 'image-to-image', 'image-to-text', 'image-to-video', 'keypoint-detection',
  'mask-generation', 'object-detection', 'video-classification', 'text-to-image', 'text-to-video',
  'unconditional-image-generation', 'video-to-video', 'zero-shot-image-classification',
  'zero-shot-object-detection', 'text-to-3d', 'image-to-3d', 'audio-classification', 'audio-to-audio',
  'automatic-speech-recognition', 'text-to-speech', 'tabular-classification', 'tabular-regression',
  'reinforcement-learning'
]);

const VALID_SORT = new Set(['trending', 'likes', 'downloads', 'created', 'modified']);
const SORT_TO_API = {
  trending: 'trendingScore',
  likes: 'likes',
  downloads: 'downloads',
  created: 'createdAt',
  modified: 'lastModified'
};

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async (page, params, cwd) => {
  // --- parameter validation (before any network call) ---
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

  const sort = params.sort;
  if (!VALID_SORT.has(sort)) {
    const err = new Error('[INVALID_PARAM] Invalid sort value: ' + sort + '. Accepted: trending | likes | downloads | created | modified');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const apiSort = SORT_TO_API[sort];

  const pipelineTag = params.pipeline_tag;
  if (pipelineTag === '') {
    const err = new Error('[INVALID_PARAM] pipeline_tag must not be empty.');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (pipelineTag !== undefined && pipelineTag !== null && !PIPELINE_TAGS.has(pipelineTag)) {
    const err = new Error('[INVALID_PARAM] Invalid pipeline_tag: ' + pipelineTag + '. Allowed values: ' + Array.from(PIPELINE_TAGS).join(', '));
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const searchRaw = params.search || '';
  const search = searchRaw.trim();
  const author = params.author || '';

  // --- build the HF internal list API URL ---
  const qs = ['limit=' + limit];
  if (apiSort) qs.push('sort=' + apiSort);
  if (pipelineTag) qs.push('pipeline_tag=' + encodeURIComponent(pipelineTag));
  if (search) qs.push('search=' + encodeURIComponent(search));
  if (author) qs.push('author=' + encodeURIComponent(author));
  const apiUrl = 'https://huggingface.co/api/models?' + qs.join('&');

  // --- navigate once to establish huggingface.co origin, then fetch the API in-page ---
  try {
    await page.goto('https://huggingface.co/models', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    const err = new Error('[NETWORK_ERROR] Failed to reach huggingface.co from the browser: ' + e.message);
    err.code = 'NETWORK_ERROR';
    throw err;
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
      return { items: Array.isArray(body) ? body : [], status: res.status };
    }, apiUrl);
  } catch (e) {
    const err = new Error('[NETWORK_ERROR] In-page fetch to HF list API failed: ' + e.message);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (result.error) {
    const err = new Error('[NETWORK_ERROR] ' + result.error + ' (HTTP ' + result.status + ')');
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  const items = result.items.map((it) => ({
    id: it.id,
    url: 'https://huggingface.co/' + it.id,
    likes: it.likes !== undefined ? it.likes : null,
    downloads: it.downloads !== undefined ? it.downloads : null,
    trendingScore: it.trendingScore !== undefined ? it.trendingScore : null,
    pipeline_tag: it.pipeline_tag !== undefined ? it.pipeline_tag : null,
    library_name: it.library_name !== undefined ? it.library_name : null,
    tags: Array.isArray(it.tags) ? it.tags : [],
    createdAt: it.createdAt !== undefined ? it.createdAt : null,
    lastModified: it.lastModified !== undefined ? it.lastModified : null,
    author: typeof it.id === 'string' && it.id.includes('/') ? it.id.split('/')[0] : null
  }));

  if (items.length === 0) {
    const err = new Error('[EMPTY_RESULT] No models match the given filters (pipeline_tag/search/author).');
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  return {
    items,
    count: items.length,
    filters: {
      pipeline_tag: pipelineTag || null,
      sort,
      search: search || null,
      author: author || null
    }
  };
};
