// arxiv/get-author-papers
// Lists papers by an author's name via the official arXiv Atom API.
// Data source: https://export.arxiv.org/api/query (public, no auth, no browser).

const API_BASE = 'https://export.arxiv.org/api/query';
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
// arXiv API etiquette: >=3s between consecutive requests. The normal path is a
// single request (max_results <= 200 fills the limit), so this only applies if
// a defensive re-query is ever needed.
const REQUEST_GAP_MS = 3000;

function cleanXmlText(text) {
  return text
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+/g, ' ');
}

// Convert a natural name to the family-name token used in the au: query.
// "Yann LeCun" -> "LeCun"; comma form "LeCun, Yann" -> "LeCun";
// single token "LeCun" -> "LeCun"; multi-word family "Laurens van der Maaten"
// is approximated by its last token "Maaten" (verified ~equal recall vs the
// quoted full phrase). The formal "Last, F" abbreviation is intentionally NOT
// used — it fails on the Atom API (au:"LeCun, Y" returns 1 hit).
function extractFamilyName(author) {
  const trimmed = author.trim();
  if (trimmed.includes(',')) {
    return trimmed.split(',')[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

function parseAtomXml(xml) {
  const papers = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRe.exec(xml)) !== null) {
    const entry = match[1];

    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

    const rawId = idMatch ? idMatch[1].replace('http://arxiv.org/abs/', '') : '';
    const id = rawId.replace(/v\d+$/, '');

    const authors = [];
    // Tolerant of optional sub-elements inside <author> (e.g. <arxiv:affiliation>
    // between </name> and </author>), which a strict `</name>\s*</author>` regex
    // would silently drop. Matches <author> ... <name>NAME</name>.
    const authorRe = /<author>[\s\S]*?<name>([^<]+)<\/name>/g;
    let authorMatch;
    while ((authorMatch = authorRe.exec(entry)) !== null) {
      authors.push(authorMatch[1]);
    }

    const categories = [];
    const catRe = /<category term="([^"]+)"/g;
    let catMatch;
    while ((catMatch = catRe.exec(entry)) !== null) {
      categories.push(catMatch[1]);
    }

    papers.push({
      id,
      title: titleMatch ? cleanXmlText(titleMatch[1]) : '',
      authors,
      abstract: summaryMatch ? cleanXmlText(summaryMatch[1]) : '',
      categories,
      publishedAt: publishedMatch ? publishedMatch[1] : '',
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`
    });
  }
  return papers;
}

async function fetchAtomText(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // Transport-level failure (DNS, connection reset, timeout) — distinct from
    // an HTTP error status, so the caller can tell "API unreachable" from
    // "API answered with an error".
    const err = new Error(`[NETWORK_ERROR] Failed to reach arXiv API: ${e.message}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`[API_ERROR] arXiv API returned status ${res.status}`);
    err.code = 'API_ERROR';
    throw err;
  }
  return res.text();
}

export default async function(params) {
  const author = params.author;
  if (!author || author.trim() === '') {
    const err = new Error('[MISSING_PARAM] Author name is required (e.g. --author "Yann LeCun")');
    err.code = 'MISSING_PARAM';
    throw err;
  }

  const authorClean = author.trim();
  // Allow letters in any script + combining marks + name punctuation (space,
  // apostrophe, hyphen, period, comma). Rejects symbols/digits-only input.
  if (!/^[\p{L}\p{M}'\-\.,\s]+$/u.test(authorClean)) {
    const err = new Error(`[INVALID_PARAM] Author name contains unsupported characters: "${authorClean}"`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const family = extractFamilyName(authorClean);
  if (!family) {
    const err = new Error('[INVALID_PARAM] Could not extract a family name from the given author');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // Validate the raw limit string first (no parseInt truncation), then convert.
  const limitStr = String(params.limit == null ? '' : params.limit).trim();
  if (!/^\d+$/.test(limitStr)) {
    const err = new Error(`[INVALID_PARAM] limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const limit = parseInt(limitStr, 10);
  if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
    const err = new Error(`[INVALID_PARAM] limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  let searchQuery = `au:${family}`;
  const category = params.category ? params.category.trim() : '';
  if (category) {
    searchQuery += ` AND cat:${category}`;
  }

  // Single request normally fills the limit (max_results <= 200). A defensive
  // loop covers the unlikely case the API returns fewer than requested while
  // totalResults says more remain; it pauses >=3s (+ up to 1s jitter) between
  // requests per arXiv etiquette.
  const papers = [];
  let totalResults = 0;
  let start = 0;

  while (papers.length < limit) {
    const pageSize = limit - papers.length;
    const url = `${API_BASE}?search_query=${encodeURIComponent(searchQuery)}&start=${start}&max_results=${pageSize}&sortBy=submittedDate&sortOrder=descending`;

    const xml = await fetchAtomText(url);

    const totalMatch = xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/);
    if (totalResults === 0) {
      totalResults = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    }

    const batch = parseAtomXml(xml);
    papers.push(...batch);

    if (papers.length >= limit) break;
    if (batch.length === 0) break;
    start += batch.length;
    if (start >= totalResults) break;

    const jitter = Math.floor(Math.random() * 1000);
    await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS + jitter));
  }

  const sliced = papers.slice(0, limit);
  return {
    query: searchQuery,
    totalResults,
    count: sliced.length,
    partial: sliced.length < limit,
    papers: sliced
  };
}
