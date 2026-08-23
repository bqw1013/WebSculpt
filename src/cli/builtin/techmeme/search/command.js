// techmeme/search — keyword search over Techmeme's news archive (the same
// corpus and ranking as the on-site search box at techmeme.com/search).
// Anonymous GET of static HTML; no login, no browser required.
//
// Verified 2026-08-19 (explore trace + 58-request rate test):
//   - GET /search/query?q={q}&start={off} returns static HTML (HTTP 200).
//   - Results live in <div class="results"> -> <div class="resultscanvas">
//     -> <div class="items">; the sidebar "Sponsor Posts" uses the same
//     class="item" markup but lives in a separate sponsorscanvas, so the
//     command only ever parses the items container.
//   - Pagination is fixed at 10 items per page; start is a 0-based offset
//     (0, 10, 20, ...). start >= 1000 returns an empty page. Header looks
//     like "Results 1 - 10 of about 4099:".
//   - An empty query page has no H2 "Results" header and no items container;
//     it shows "Your search ... did not match any news items" — return [].
//   - q must be encodeURIComponent'd: raw & or # in q would otherwise be
//     treated as URL delimiters and truncate the query.

const SEARCH_BASE = "https://www.techmeme.com/search/query";
const SITE_ORIGIN = "https://www.techmeme.com";
const PAGE_SIZE = 10; // Techmeme always renders 10 items per results page
const MAX_LIMIT = 1000; // site caps pagination around 1000 items (start<1000)
const MAX_START = 1000; // start >= 1000 returns an empty page
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function fail(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

// Rate-aware pacing: random 200-700ms before each request (user hard requirement).
function randomDelayMs() {
  return 200 + Math.floor(Math.random() * 500);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function cleanText(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

// Like cleanText but also strips inline HTML tags (needed for the summary,
// whose raw slice ends with the ii block's closing </DIV>).
function cleanHtmlText(text) {
  return decodeEntities(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${SITE_ORIGIN}${url}`;
  return `${SITE_ORIGIN}/${url}`;
}

const TIMEOUT_MS = 30000;

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": CHROME_UA },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    fail("NETWORK_ERROR", `request failed for ${url}: ${err.message}`);
  }
  clearTimeout(timer);
  if (res.status === 429 || res.status === 403) {
    fail("RATE_LIMITED", `Techmeme blocked the request (HTTP ${res.status})`);
  }
  if (!res.ok) {
    fail("API_ERROR", `Techmeme returned HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  if (!text || text.length < 500) {
    fail("API_ERROR", `Empty or truncated response from ${url}`);
  }
  return text;
}

function parseItem(block) {
  // author + source: <CITE> is "Author / <A HREF=...>Source</A>:" — the text
  // before the first anchor is the author (null when absent, e.g. "Anthropic:").
  const citeMatch = block.match(/<CITE>([\s\S]*?)<\/CITE>/i);
  let author = null;
  let source = null;
  if (citeMatch) {
    const cite = citeMatch[1];
    const sourceLink = cite.match(/<A\s+HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>/i);
    if (sourceLink) {
      source = { name: cleanText(sourceLink[2]), url: absolutize(sourceLink[1]) };
      const before = cite.slice(0, cite.search(/<A\s/i));
      const authorRaw = before.replace(/<[^>]*>/g, " ").replace(/[:\s/]+$/g, "").trim();
      if (authorRaw.length > 0) author = cleanText(authorRaw);
    }
  }

  // title + url: the anchor inside <STRONG CLASS="L2">.
  const titleMatch = block.match(
    /<STRONG\s+CLASS="L2">[\s\S]*?<A\s+HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>[\s\S]*?<\/STRONG>/i
  );
  let title = "";
  let url = "";
  if (titleMatch) {
    url = absolutize(titleMatch[1]);
    title = cleanText(titleMatch[2]);
  }

  // summary: text after </STRONG> up to the ii block close marker.
  const summaryRaw = block.match(/<\/STRONG>([\s\S]*?)<!--\s*end\s*ii\s*-->/i);
  let summary = "";
  if (summaryRaw) {
    summary = cleanHtmlText(summaryRaw[1]).replace(/^\s*[—–-]\s*/, "").trim();
  }

  const dateMatch = block.match(/<SPAN\s+CLASS="idate">([^<]+)<\/SPAN>/i);
  const publishedAt = dateMatch ? dateMatch[1].trim() : "";

  // permalink: the "In context" link, minus the #a... item-level fragment.
  const contextMatch = block.match(/<span\s+class="icontext">[\s\S]*?<a\s+href="([^"]+)"/i);
  let permalink = "";
  if (contextMatch) permalink = contextMatch[1].split("#")[0];

  const imgMatch = block.match(/<IMG[^>]*>/i);
  let image = "";
  if (imgMatch) {
    const src = imgMatch[0].match(/src="([^"]+)"/i);
    if (src) image = absolutize(src[1]);
  }

  return { title, summary, author, source, url, published_at: publishedAt, permalink, image };
}

function parseResultsPage(html) {
  const headerMatch = html.match(/<H2>Results\s+\d+\s*-\s*\d+\s+of\s+(?:about\s+)?([\d,]+):/i);
  const total = headerMatch ? parseInt(headerMatch[1].replace(/,/g, ""), 10) : 0;

  const itemsMatch = html.match(/<div\s+class="items">([\s\S]*?)<\/div>\s*<!--\s*items\s*-->/i);
  if (!itemsMatch) return { total, items: [] };

  const region = itemsMatch[1];
  const blocks = region.split(/<DIV\s+CLASS="item"/i);
  const items = [];
  for (let i = 1; i < blocks.length; i += 1) {
    const item = parseItem(blocks[i]);
    if (item.title || item.url) items.push(item);
  }
  return { total, items };
}

export default async function (params) {
  // q: required, non-empty after trimming.
  const q = params.q == null ? "" : String(params.q).trim();
  if (q === "") {
    fail("MISSING_PARAM", 'q is required (search keywords, e.g. "anthropic" or \'openai funding\')');
  }

  // limit: 1-1000, default 20 (manifest injects the default).
  const rawLimit = params.limit == null ? "" : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    fail("INVALID_PARAM", `Invalid limit "${rawLimit}". Must be an integer 1-${MAX_LIMIT}`);
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    fail("INVALID_PARAM", `Invalid limit "${rawLimit}". Must be between 1 and ${MAX_LIMIT}`);
  }

  const items = [];
  let total = 0;
  let start = 0;

  while (items.length < limit && start < MAX_START) {
    const url = `${SEARCH_BASE}?q=${encodeURIComponent(q)}&start=${start}`;
    await sleep(randomDelayMs());
    const html = await fetchPage(url);
    const page = parseResultsPage(html);
    if (start === 0) total = page.total;
    if (page.items.length === 0) break; // empty page = end of available results
    for (const item of page.items) {
      if (items.length >= limit) break;
      items.push(item);
    }
    if (page.items.length < PAGE_SIZE) break; // short last page = no more results
    start += PAGE_SIZE;
  }

  // partial=true only when some results exist but fewer than requested
  // (site exhausted or hit the ~1000-item pagination cap). Empty is not partial.
  const partial = items.length > 0 && items.length < limit;
  if (partial) {
    for (const item of items) item.partial = true;
  }

  return items;
}
