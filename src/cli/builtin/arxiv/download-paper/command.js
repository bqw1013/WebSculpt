import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Extract the arXiv ID from a raw ID or an abs/PDF URL.
// Accepts: new-style (2601.00001 / 2601.00001v2), old-style (hep-th/9901001 /
// hep-th/9901001v2), and arxiv.org abs/pdf URLs. The version suffix is kept.
function extractId(input) {
  const s = input.trim();
  if (!s) {
    const err = new Error('[MISSING_PARAM] The id parameter is required');
    err.code = 'MISSING_PARAM';
    throw err;
  }
  const arxivUrl = s.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+)/i);
  if (arxivUrl) return arxivUrl[1].replace(/\/+$/, '');
  if (/^https?:\/\//i.test(s)) {
    const err = new Error('[INVALID_ID] Only an arXiv ID or an arxiv.org abs/PDF URL is accepted');
    err.code = 'INVALID_ID';
    throw err;
  }
  return s;
}

// Decode HTML entities (&#39;, &amp;, &lt;, ...) that may appear inside the
// citation_title meta content attribute.
function decodeHtmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Pull the paper title from the abstract page's citation_title meta tag.
function extractTitle(html) {
  const m = html.match(/<meta name="citation_title" content="([^"]*)"/);
  return m ? decodeHtmlEntities(m[1]) : '';
}

// Make a title safe to use as a filename: replace filesystem-unsafe characters,
// strip trailing dots/spaces, prefix Windows reserved device names, cap length.
function sanitizeFilename(title) {
  let name = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 200);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
    name = `_${name}`;
  }
  return name;
}

export default async function(params) {
  const id = extractId(params.id);

  // Request 1: abstract page -> paper title.
  let absRes;
  try {
    absRes = await fetch(`https://arxiv.org/abs/${id}`);
  } catch (fetchErr) {
    const err = new Error(`[NETWORK_ERROR] Failed to reach arxiv.org abstract page for ${id}: ${fetchErr.message}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  if (absRes.status !== 200) {
    const err = new Error(`[NOT_FOUND] No arXiv paper found for id ${id} (abstract page returned ${absRes.status})`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const html = await absRes.text();
  const title = extractTitle(html);
  if (!title) {
    const err = new Error(`[NOT_FOUND] Could not read the paper title from the abstract page for id ${id}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  // arXiv API policy: space consecutive requests >=3s apart (with jitter).
  await sleep(3000 + Math.floor(Math.random() * 1000));

  // Request 2: PDF.
  let pdfRes;
  try {
    pdfRes = await fetch(`https://arxiv.org/pdf/${id}`);
  } catch (fetchErr) {
    const err = new Error(`[NETWORK_ERROR] Failed to reach arxiv.org PDF for ${id}: ${fetchErr.message}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  if (pdfRes.status !== 200) {
    const err = new Error(`[DOWNLOAD_FAILED] arXiv returned ${pdfRes.status} when downloading the PDF for id ${id}`);
    err.code = 'DOWNLOAD_FAILED';
    throw err;
  }
  const contentType = (pdfRes.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/pdf')) {
    const err = new Error(`[DOWNLOAD_FAILED] Unexpected content-type "${contentType}" for id ${id}; expected application/pdf`);
    err.code = 'DOWNLOAD_FAILED';
    throw err;
  }
  const buf = Buffer.from(await pdfRes.arrayBuffer());

  // Resolve the output directory: absolute stays, relative resolves against cwd.
  const outDir = isAbsolute(params.output) ? params.output : resolve(params.output);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${sanitizeFilename(title)}.pdf`);
  writeFileSync(file, buf);
  const sizeBytes = statSync(file).size;

  return { id, title, file, sizeBytes };
}
