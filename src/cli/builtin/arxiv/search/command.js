// arxiv/search — search arXiv papers via the public Atom API.
// Docs reference: websculpt-capture node runtime contract

const FIELD_PREFIX = {
  all: 'all',
  title: 'ti',
  author: 'au',
  abstract: 'abs',
  comments: 'co',
  journal_ref: 'jr',
  doi: 'doi',
  paper_id: 'id'
};

const SORT_MAP = {
  relevance: 'relevance',
  submitted_date: 'submittedDate',
  last_updated: 'lastUpdatedDate'
};

// Native arXiv syntax detection: field prefix, boolean keyword, or quoted phrase.
// Plain multi-word keywords are split and AND-joined by the command instead.
function isNativeSyntax(query) {
  if (/(?:^|\s)(?:ti|au|abs|co|jr|cat|rn|id|doi|all):/i.test(query)) return true;
  if (/\b(?:AND|OR|ANDNOT)\b/i.test(query)) return true;
  if (query.includes('"')) return true;
  return false;
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanXmlText(text) {
  return decodeXmlEntities(text)
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n\s+/g, '\n');
}

function buildSearchQuery(rawQuery, fieldPrefix) {
  if (isNativeSyntax(rawQuery)) {
    // Pass native syntax through verbatim; --field is ignored.
    return rawQuery.trim();
  }
  const tokens = rawQuery.trim().split(/\s+/).filter((t) => t.length > 0);
  // AND semantics for plain multi-word keywords (closest to arxiv.org's web search).
  return tokens.map((t) => `${fieldPrefix}:${t}`).join(' AND ');
}

function buildDateRange(dateFrom, dateTo) {
  const from = dateFrom ? dateFrom.replace(/-/g, '') + '0000' : null;
  const to = dateTo ? dateTo.replace(/-/g, '') + '2359' : null;
  if (from && to) return `submittedDate:[${from} TO ${to}]`;
  if (from) return `submittedDate:[${from} TO 999912312359]`;
  return `submittedDate:[190001010000 TO ${to}]`;
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const month = parseInt(value.slice(5, 7), 10);
  const day = parseInt(value.slice(8, 10), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

function parseAtomXml(xml, limit) {
  const totalMatch = xml.match(/<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/);
  const totalResults = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const papers = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[1];

    const idMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    const rawId = idMatch ? idMatch[1] : '';
    const id = rawId.replace(/v\d+$/, '');

    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

    const authors = [];
    // Block-based parse: some entries carry <arxiv:affiliation> between </name> and </author>,
    // so a strict <name>...</name>\s*</author> regex would miss those authors entirely.
    const authorBlocks = entry.match(/<author>[\s\S]*?<\/author>/g) || [];
    for (const block of authorBlocks) {
      const nameMatch = block.match(/<name>([^<]+)<\/name>/);
      if (nameMatch) authors.push(cleanXmlText(nameMatch[1]));
    }

    const categories = [];
    const categoryRegex = /<category term="([^"]+)"/g;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(entry)) !== null) {
      categories.push(categoryMatch[1]);
    }

    papers.push({
      id,
      title: cleanXmlText(titleMatch ? titleMatch[1] : ''),
      authors,
      abstract: cleanXmlText(summaryMatch ? summaryMatch[1] : ''),
      categories,
      publishedAt: publishedMatch ? publishedMatch[1] : '',
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`
    });
  }

  // partial=true only when some results were returned but fewer than the requested limit.
  // An empty result (0 papers) is a complete "no match", so partial stays false there.
  return { totalResults, papers, partial: papers.length > 0 && papers.length < limit };
}

export default async function (params) {
  const rawQuery = params.query;
  if (rawQuery === undefined || rawQuery.trim() === '') {
    const err = new Error('[MISSING_PARAM] query is required and must not be empty');
    err.code = 'MISSING_PARAM';
    throw err;
  }

  // --field enum validation (all 8 values).
  const field = params.field ?? 'all';
  const fieldPrefix = FIELD_PREFIX[field];
  if (!fieldPrefix) {
    const err = new Error(
      `[INVALID_PARAM] Invalid field "${field}". Valid values: all | title | author | abstract | comments | journal_ref | doi | paper_id`
    );
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // --sort_by enum validation (all 3 values).
  const sortBy = params.sort_by ?? 'submitted_date';
  const apiSortBy = SORT_MAP[sortBy];
  if (!apiSortBy) {
    const err = new Error(
      `[INVALID_PARAM] Invalid sort_by "${sortBy}". Valid values: relevance | submitted_date | last_updated`
    );
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // --limit number validation (regex on the original string, no parseInt truncation).
  const rawLimit = params.limit ?? '50';
  if (!/^\d+$/.test(rawLimit)) {
    const err = new Error(`[INVALID_PARAM] Invalid limit "${rawLimit}". Must be an integer 1-200`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > 200) {
    const err = new Error(`[INVALID_PARAM] Invalid limit "${rawLimit}". Must be between 1 and 200`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // --date_from / --date_to format validation (YYYY-MM-DD, either may be used alone).
  const dateFrom = params.date_from;
  const dateTo = params.date_to;
  if (dateFrom && !validateDate(dateFrom, 'date_from')) {
    const err = new Error(`[INVALID_PARAM] Invalid date_from "${dateFrom}". Expected YYYY-MM-DD`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (dateTo && !validateDate(dateTo, 'date_to')) {
    const err = new Error(`[INVALID_PARAM] Invalid date_to "${dateTo}". Expected YYYY-MM-DD`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // Build search_query.
  const parts = [buildSearchQuery(rawQuery, fieldPrefix)];
  if (params.category) {
    parts.push(`cat:${params.category}`);
  }
  if (dateFrom || dateTo) {
    parts.push(buildDateRange(dateFrom, dateTo));
  }
  const searchQuery = parts.join(' AND ');

  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}` +
    `&start=0&max_results=${limit}&sortBy=${apiSortBy}&sortOrder=descending`;

  let res;
  try {
    res = await fetch(url);
  } catch (fetchErr) {
    const err = new Error(`[API_ERROR] Failed to reach arXiv API: ${fetchErr.message}`);
    err.code = 'API_ERROR';
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`[API_ERROR] arXiv API returned HTTP ${res.status} for the given query`);
    err.code = 'API_ERROR';
    throw err;
  }

  const xml = await res.text();
  return parseAtomXml(xml, limit);
}
