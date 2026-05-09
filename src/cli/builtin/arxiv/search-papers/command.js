import https from 'https';

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          collectBody(res2, resolve, reject);
        }).on('error', reject);
        return;
      }
      collectBody(res, resolve, reject);
    }).on('error', reject);
  });
}

function collectBody(res, resolve, reject) {
  if (res.statusCode !== 200) {
    const err = new Error(`API_ERROR arxiv API returned status ${res.statusCode}`);
    err.code = 'API_ERROR';
    reject(err);
    return;
  }
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => resolve(data));
}

function cleanXmlText(text) {
  return text
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n\s+/g, '\n');
}

function parseAtomXml(xml) {
  const papers = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
    const commentMatch = entry.match(/<arxiv:comment>([^<]+)<\/arxiv:comment>/);

    const rawId = idMatch ? idMatch[1] : '';
    const id = rawId.replace('http://arxiv.org/abs/', '').replace(/v\d+$/, '');
    const title = titleMatch ? cleanXmlText(titleMatch[1]) : '';
    const summary = summaryMatch ? cleanXmlText(summaryMatch[1]) : '';
    const published = publishedMatch ? publishedMatch[1] : '';
    const updated = updatedMatch ? updatedMatch[1] : '';
    const comment = commentMatch ? commentMatch[1] : '';

    const authors = [];
    const authorRegex = /<author>\s*<name>([^<]+)<\/name>\s*<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1]);
    }

    const categories = [];
    const catRegex = /<category term="([^"]+)"/g;
    let catMatch;
    while ((catMatch = catRegex.exec(entry)) !== null) {
      categories.push(catMatch[1]);
    }

    const primaryCatMatch = entry.match(/<arxiv:primary_category term="([^"]+)"/);
    const primaryCategory = primaryCatMatch ? primaryCatMatch[1] : (categories[0] || '');

    const htmlUrl = id ? `https://arxiv.org/abs/${id}` : '';
    const pdfUrl = id ? `https://arxiv.org/pdf/${id}` : '';

    papers.push({
      id,
      title,
      summary,
      authors,
      published,
      updated,
      primaryCategory,
      categories,
      comment,
      htmlUrl,
      pdfUrl
    });
  }

  return papers;
}

export default async function(params) {
  const query = params.query;
  if (!query || query.trim() === '') {
    const err = new Error('[MISSING_PARAM] Query parameter is required');
    err.code = 'MISSING_PARAM';
    throw err;
  }

  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 50);
  const sortBy = ['submittedDate', 'relevance', 'lastUpdatedDate'].includes(params.sortBy)
    ? params.sortBy
    : 'submittedDate';
  const sortOrder = ['ascending', 'descending'].includes(params.sortOrder)
    ? params.sortOrder
    : 'descending';

  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;

  const xml = await fetchXml(url);
  const papers = parseAtomXml(xml);

  if (papers.length === 0) {
    const err = new Error('[EMPTY_RESULT] No papers found for the given query');
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  return papers;
}
