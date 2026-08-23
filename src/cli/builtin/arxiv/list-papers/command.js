// arxiv/list-papers
// arXiv category paper listing stream. Maps to the category pages:
//   - period=new    -> https://arxiv.org/list/{cat}/new     (today's new/cross/replacement submissions, three sections, inline abstracts)
//   - period=recent -> https://arxiv.org/list/{cat}/recent  (past week, grouped by day, title-only cards)
//   - period=month  -> Atom API submittedDate range          (monthly archive with precise timestamps and abstracts)
// Each invocation makes a single request (no internal pagination). arXiv's etiquette of >=3s between
// consecutive requests is observed at the caller level; see README for usage notes.
import https from 'https';

const HTML_SHOWS = [25, 50, 100, 250];
const VALID_PERIODS = ['new', 'recent', 'month'];
const MONTH_NAMES = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
const MONTH_NAMES_SHORT = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebSculpt/1.0';
const CATEGORY_RE = /^[a-z][a-z0-9-]*(\.[a-zA-Z0-9-]+)?$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function unescapeHtml(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(Number(dec)));
}

function cleanText(text) {
  return unescapeHtml((text || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function bizError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function httpGetText(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        httpGetText(next, headers).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', (cause) => {
      reject(bizError('HTTP_ERROR', `Request to arXiv failed: ${cause.message}`));
    });
  });
}

async function httpGet(url, accept) {
  const headers = { 'User-Agent': UA, Accept: accept };
  const { status, body } = await httpGetText(url, headers);
  if (status === 400) {
    throw bizError('INVALID_CATEGORY', 'arXiv rejected the category (HTTP 400 "Invalid archive or category"). Category is case-sensitive (e.g. cs.AI, not cs.ai); see arxiv/list-categories for the ~155 valid values.');
  }
  if (status === 404) {
    throw bizError('NOT_FOUND', `arXiv returned 404 for ${url}`);
  }
  if (status !== 200) {
    throw bizError('HTTP_ERROR', `arXiv returned HTTP ${status} for ${url}`);
  }
  return body;
}

function parseNewDate(text) {
  const m = text.match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/);
  if (!m) return null;
  const month = MONTH_NAMES[m[2]];
  if (!month) return null;
  return `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`;
}

function parseDayDate(text) {
  const m = text.match(/([A-Za-z]{3}), (\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
  if (!m) return null;
  const month = MONTH_NAMES_SHORT[m[3]];
  if (!month) return null;
  return `${m[4]}-${pad(month)}-${pad(Number(m[2]))}`;
}

function lastMonthString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  return `${prevYear}-${pad(prevMonth + 1)}`;
}

function pickShow(limit) {
  const found = HTML_SHOWS.find((s) => s >= limit);
  return found === undefined ? 250 : found;
}

// Parse one <dl id='articles'> block into paper cards (id/title/authors/categories/abstract).
function parseHtmlEntries(dlBlock) {
  const papers = [];
  const parts = dlBlock.split('<dt>').slice(1);
  for (const part of parts) {
    const ddIndex = part.indexOf('<dd>');
    const dtPart = ddIndex === -1 ? part : part.slice(0, ddIndex);
    const absMatch = dtPart.match(/href\s*=\s*["']\/abs\/([^"'#]+)["']/);
    const pdfMatch = dtPart.match(/href\s*=\s*["']\/pdf\/([^"'#]+)["']/);
    const ddMatch = part.match(/<dd>([\s\S]*?)<\/dd>/);
    if (!absMatch || !ddMatch) continue;
    const dd = ddMatch[1];
    const id = absMatch[1].replace(/v\d+$/, '');
    const titleMatch = dd.match(/<div class='list-title mathjax'>\s*<span class='descriptor'>Title:<\/span>\s*([\s\S]*?)\s*<\/div>/);
    const authorsMatch = dd.match(/<div class='list-authors'>(.*?)<\/div>/);
    const subjectsMatch = dd.match(/<div class='list-subjects'>([\s\S]*?)<\/div>/);
    const abstractMatch = dd.match(/<p class='mathjax'>([\s\S]*?)<\/p>/);
    const authors = authorsMatch
      ? [...authorsMatch[1].matchAll(/>([^<>]+)<\/a>/g)].map((m) => unescapeHtml(m[1].trim()))
      : [];
    const categories = subjectsMatch
      ? [...subjectsMatch[1].matchAll(/\(([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*)\)/g)].map((m) => m[1])
      : [];
    const paper = {
      id,
      title: titleMatch ? cleanText(titleMatch[1]) : '',
      authors,
      categories,
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${pdfMatch ? pdfMatch[1].replace(/v\d+$/, '') : id}`,
    };
    if (abstractMatch) paper.abstract = cleanText(abstractMatch[1]);
    papers.push(paper);
  }
  return papers;
}

function groupKeyFromHeading(name) {
  if (name.startsWith('New submissions')) return 'new';
  if (name.startsWith('Cross submissions')) return 'cross';
  if (name.startsWith('Replacement submissions')) return 'replacements';
  return null;
}

async function fetchNew(category, limit) {
  const html = await httpGet(`https://arxiv.org/list/${category}/new`, 'text/html,application/xhtml+xml');
  const dateMatch = html.match(/<h3>Showing new listings for ([^<]+)<\/h3>/);
  if (!dateMatch) throw bizError('DRIFT_DETECTED', 'New listing date header not found on /list/' + category + '/new');
  const date = parseNewDate(dateMatch[1]);
  const groups = { new: [], cross: [], replacements: [] };
  const dlRe = /<dl id='articles'>([\s\S]*?)<\/dl>/g;
  let dlMatch;
  let foundSection = false;
  while ((dlMatch = dlRe.exec(html))) {
    const block = dlMatch[1];
    const headingMatch = block.match(/<h3>([^<]*)<\/h3>/);
    const heading = headingMatch ? headingMatch[1] : '';
    const key = groupKeyFromHeading(heading);
    if (!key) continue;
    foundSection = true;
    const papers = parseHtmlEntries(block);
    papers.forEach((paper) => { paper.publishedAt = date; });
    groups[key] = papers;
  }
  if (!foundSection) {
    throw bizError('DRIFT_DETECTED', 'No listing sections found on /list/' + category + '/new');
  }
  const result = { date, new: [], cross: [], replacements: [], partial: false };
  for (const key of ['new', 'cross', 'replacements']) {
    result[key] = groups[key].slice(0, limit);
    if (groups[key].length < limit) result.partial = true;
  }
  return result;
}

async function fetchRecent(category, limit) {
  const show = pickShow(limit);
  const html = await httpGet(`https://arxiv.org/list/${category}/recent?skip=0&show=${show}`, 'text/html,application/xhtml+xml');
  const all = [];
  const dlRe = /<dl id='articles'>([\s\S]*?)<\/dl>/g;
  let dlMatch;
  let foundDay = false;
  while ((dlMatch = dlRe.exec(html))) {
    const block = dlMatch[1];
    const headingMatch = block.match(/<h3>([^<]*)<\/h3>/);
    const day = headingMatch ? parseDayDate(headingMatch[1]) : null;
    if (!day) continue;
    foundDay = true;
    const papers = parseHtmlEntries(block);
    papers.forEach((paper) => { paper.publishedAt = day; });
    all.push(...papers);
  }
  if (!foundDay) {
    // Valid category with no recent announcements this week.
    return { papers: [], partial: true };
  }
  const sliced = all.slice(0, limit);
  return { papers: sliced, partial: sliced.length < limit };
}

function monthBounds(month) {
  const parts = month.split('-');
  const year = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10);
  const lastDay = new Date(year, monthNum, 0).getDate();
  const yyyymm = `${year}${pad(monthNum)}`;
  return { start: `${yyyymm}010000`, end: `${yyyymm}${pad(lastDay)}2359` };
}

function parseAtomEntries(xml) {
  const papers = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryRe.exec(xml))) {
    const entry = entryMatch[1];
    const idMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const publishedMatch = entry.match(/<published>([^<]*)<\/published>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const primaryMatch = entry.match(/<arxiv:primary_category term="([^"]+)"/);
    const rawId = idMatch ? idMatch[1] : '';
    const baseId = rawId.replace(/v\d+$/, '');
    const authors = [...entry.matchAll(/<name>([^<]*)<\/name>/g)].map((m) => unescapeHtml(m[1]));
    const allCats = [...entry.matchAll(/<category term="([^"]+)"/g)].map((m) => m[1]);
    const primary = primaryMatch ? primaryMatch[1] : (allCats[0] || '');
    const categories = primary ? [primary, ...allCats.filter((c) => c !== primary)] : allCats;
    const paper = {
      id: baseId,
      title: titleMatch ? cleanText(titleMatch[1]) : '',
      authors,
      categories,
      publishedAt: publishedMatch ? publishedMatch[1] : '',
      url: `https://arxiv.org/abs/${baseId}`,
      pdfUrl: `https://arxiv.org/pdf/${baseId}`,
    };
    if (summaryMatch) paper.abstract = cleanText(summaryMatch[1]);
    papers.push(paper);
  }
  return papers;
}

async function fetchMonth(category, month, limit) {
  const { start, end } = monthBounds(month);
  const searchQuery = `cat:${category} AND submittedDate:[${start} TO ${end}]`;
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  const xml = await httpGet(url, 'application/atom+xml');
  const totalMatch = xml.match(/<opensearch:totalResults>([^<]*)<\/opensearch:totalResults>/);
  const totalResults = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const papers = parseAtomEntries(xml);
  const partial = papers.length < limit || totalResults < limit;
  return { papers, partial };
}

export default async function(params) {
  const category = (params.category || '').trim();
  if (!category) {
    throw bizError('MISSING_PARAM', 'category is required (e.g. cs.AI). See arxiv/list-categories for the ~155 valid values.');
  }
  if (!CATEGORY_RE.test(category)) {
    throw bizError('INVALID_CATEGORY', `Invalid category "${category}": expected an arXiv category id like "cs.AI", "cs.LG", "astro-ph.CO" or "hep-th". Category is case-sensitive (archives lowercase, e.g. cs.AI not CS.AI); see arxiv/list-categories for the ~155 valid values.`);
  }

  const period = params.period || 'new';
  if (!VALID_PERIODS.includes(period)) {
    throw bizError('INVALID_PERIOD', `Invalid period "${period}": must be one of new (today's new/cross/replacement submissions, default) | recent (past week, grouped by day) | month (monthly archive, set --month).`);
  }

  const limitParsed = parseInt(params.limit, 10);
  if (!Number.isInteger(limitParsed) || limitParsed < 1 || limitParsed > 200) {
    throw bizError('INVALID_LIMIT', `Invalid limit "${params.limit}": must be an integer between 1 and 200.`);
  }
  const limit = limitParsed;

  if (period === 'new') return fetchNew(category, limit);
  if (period === 'recent') return fetchRecent(category, limit);

  // period === 'month'
  let month = (params.month || '').trim();
  if (month) {
    if (!MONTH_RE.test(month)) {
      throw bizError('INVALID_MONTH', `Invalid month "${month}": expected YYYY-MM (e.g. 2026-07).`);
    }
  } else {
    month = lastMonthString();
  }
  return fetchMonth(category, month, limit);
}
