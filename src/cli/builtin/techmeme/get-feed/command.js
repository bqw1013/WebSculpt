// techmeme/get-feed — Techmeme front-page curated news feed (story clusters).
// Static-HTML endpoint, no login, no API key, no browser. Node runtime.
//
// Homepage (https://www.techmeme.com/) carries:
//   - Top News    → story clusters wrapped in <DIV CLASS="clus"> (1-3 items each;
//                   extra items are same-event secondary reports in relitems)
//   - More News   → bare itc1/itc2 blocks (no clus wrapper)
//   - Earlier Picks → bare itc1/itc2 blocks
// Each story is an itc1 > itc2 block keyed by a pml id like "260818p29"; the
// official Techmeme social-post links live as attributes on the story's
// <span pml=... twurl=... mdurl=... thurl=... bsurl=... twid=...>. Individual
// social attributes may be missing per item and are tolerated as null.
//
// Historical --date resolves to the site's own {yymmdd}/h2000 snapshot with
// h1130/h0000 fallbacks (no server-side nearest-time redirect exists; a date
// equal to today uses the homepage directly). The permalink is built from the
// pml id itself, never the page date (a snapshot can show stories from earlier
// days, e.g. 260814p32 appears on the 260815 snapshot).

const HOMEPAGE = 'https://www.techmeme.com/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const TIMEOUT_MS = 30000;

const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', nbsp: ' ',
  inodot: 'ı', uuml: 'ü', aacute: 'á', eacute: 'é',
  ntilde: 'ñ', euml: 'ë', copy: '©', trade: '™',
  reg: '®', times: '×'
};

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch { return m; }
    })
    .replace(/&#(\d+);/g, (m, d) => {
      try { return String.fromCharCode(Number(d)); } catch { return m; }
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITY_MAP[name] || m)
    .replace(/&amp;/gi, '&');
}

function cleanText(s) {
  if (!s) return '';
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ---- HTTP ---------------------------------------------------------------

// Random 200-700ms sleep before EVERY request (courtesy delay; Techmeme
// itself measured unlimited, but we stay conservative). Returns null on 404 so
// the date-snapshot fallback chain can try the next candidate.
async function fetchHtml(url) {
  await sleep(randomBetween(200, 700));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    fail('NETWORK_ERROR', `Failed to fetch ${url}: ${e.message}`);
  }
  clearTimeout(timer);
  if (resp.status === 404) return null; // date-snapshot fallback
  if (resp.status === 403 || resp.status === 429) {
    fail('RATE_LIMITED', `Techmeme rate-limited or blocked the request (HTTP ${resp.status}) for ${url}`);
  }
  if (resp.status !== 200) {
    fail('API_ERROR', `Unexpected HTTP ${resp.status} from ${url}`);
  }
  const text = await resp.text();
  if (!text || text.length < 500) {
    fail('API_ERROR', `Empty or truncated response from ${url}`);
  }
  return text;
}

// ---- HTML parsing --------------------------------------------------------

// H2 section header offsets; each story's section is the last H2 that precedes it.
function h2Sections(html) {
  const offsets = [];
  const re = /<H2[^>]*>([^<]*)<\/H2>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    offsets.push({ text: m[1].trim(), offset: m.index });
  }
  return offsets;
}

function sectionAt(sections, offset) {
  let text = null;
  for (const h of sections) {
    if (h.offset < offset) text = h.text;
  }
  return text;
}

function mapSection(text) {
  if (text === 'Top News') return 'top';
  if (text === 'More News') return 'more';
  if (text === 'Earlier Picks') return 'earlier';
  return null; // Sponsor Posts / Featured Podcasts / Newest / etc. are skipped
}

// Extract a single story from one itc1 block. Returns null when the block is not
// a story (no pml / no ourh title link).
function parseStory(block) {
  // pml id + official Techmeme social post links live on the story span.
  // Individual attributes may be missing (measured: 2/43 items lack one).
  const spanM = block.match(/<span[^>]*pml="([0-9]+p[0-9]+)"[^>]*>/i);
  if (!spanM) return null;
  const pml = spanM[1];
  const permalink = `https://www.techmeme.com/${pml.slice(0, 6)}/p${pml.slice(7)}`;
  const tag = spanM[0];
  const attr = (name) => {
    const a = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
    return a ? a[1] : null;
  };
  const social = {
    x: attr('twurl'),
    mastodon: attr('mdurl'),
    threads: attr('thurl'),
    bluesky: attr('bsurl'),
    twid: attr('twid')
  };

  // Title + original URL.
  const titleM = block.match(/<STRONG[^>]*><A CLASS="ourh" HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A><\/STRONG>/i);
  if (!titleM) return null;
  const title = cleanText(titleM[2]);
  const url = titleM[1];

  // Source / author cite: "<CITE>Author / <A HREF="site">Name</A>:</CITE>".
  let source = { name: null, url: null };
  let author = null;
  const citeM = block.match(/<CITE>([\s\S]*?)<\/CITE>/i);
  if (citeM) {
    const cite = citeM[1];
    const srcM = cite.match(/<A HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/i);
    if (srcM) {
      source = { name: cleanText(srcM[2]), url: srcM[1] };
      const before = cite.slice(0, cite.indexOf('<A HREF='));
      author = cleanText(before).replace(/^Author\s*$/i, '').replace(/:\s*$/, '').replace(/\/\s*$/, '').trim() || null;
    } else {
      source = { name: cleanText(cite).replace(/:\s*$/, ''), url: null };
    }
  }

  // Summary = text after the &mdash; separator following the title (already
  // truncated with "…" by the page; may be absent).
  let summary = null;
  const afterTitle = block.slice(titleM.index + titleM[0].length, titleM.index + titleM[0].length + 3000);
  const dash = afterTitle.match(/(?:mdash;|&mdash;|—)\s*([\s\S]*?)(?=<DIV|<\/DIV>|<SPAN|$)/i);
  if (dash && cleanText(dash[1])) summary = cleanText(dash[1]);

  // Image (a relative URL needs the site prefix; may be absent).
  let image = null;
  const imgM = block.match(/<IMG CLASS="ill" SRC="([^"]*)"/i);
  if (imgM) {
    image = imgM[1].startsWith('http') ? imgM[1] : `https://www.techmeme.com${imgM[1]}`;
  }

  // "More:" related reports — visible collapsed state: source name + URL only.
  const related = [];
  const moreM = block.match(/<SPAN CLASS="drhed">More:<\/SPAN>&nbsp;<span class="bls">([\s\S]*?)<\/span>/i);
  if (moreM) {
    for (const l of moreM[1].matchAll(/<A HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi)) {
      related.push({ source: cleanText(l[2]).replace(/,\s*$/, ''), url: l[1] });
    }
  }

  // Discussion groups — visible collapsed state. Groups: X / LinkedIn / Bluesky /
  // Mastodon / Forums. "More:" is handled above and ignored here.
  const discussions = { x: [], linkedin: [], bluesky: [], mastodon: [], forums: [] };
  const groupRe = /<SPAN CLASS="drhed">([^<]+):<\/SPAN>&nbsp;<span class="bls">([\s\S]*?)<\/span>/gi;
  for (const g of block.matchAll(groupRe)) {
    const key = cleanText(g[1]).toLowerCase();
    if (!discussions[key]) continue;
    const links = [];
    for (const l of g[2].matchAll(/<A HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi)) {
      links.push({ label: cleanText(l[2]).replace(/,\s*$/, ''), url: l[1] });
    }
    discussions[key].push(...links);
  }

  return {
    title,
    summary,
    source,
    author,
    url,
    permalink,
    image,
    related,
    discussions,
    social_posts: social
  };
}

// Walk every itc1 story block in page order (editorial priority), tagging each
// with its section and skipping non-story sections / non-story blocks.
function parseFeed(html) {
  const sections = h2Sections(html);
  const items = [];
  const itc1Re = /<DIV CLASS="itc1"([^>]*)>([\s\S]*?)(?=<DIV CLASS="itc1"|<DIV CLASS="relitems">|<H2|<\/BODY>|<DIV CLASS="sb")/gi;
  let m;
  while ((m = itc1Re.exec(html)) !== null) {
    const section = mapSection(sectionAt(sections, m.index));
    if (!section) continue;
    const story = parseStory(m[2]);
    if (!story) continue;
    story.section = section;
    items.push(story);
  }
  return items;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// ---- Command -------------------------------------------------------------

export default async function (params) {
  // ---- limit (default 20, 1-100) ----
  const rawLimit = params.limit == null ? '' : String(params.limit).trim();
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit)) {
      fail('INVALID_PARAM', `limit must be a positive integer between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      fail('INVALID_PARAM', `limit must be between 1 and ${MAX_LIMIT}, got "${rawLimit}"`);
    }
  }

  // ---- date (optional, YYYY-MM-DD, default today → homepage) ----
  const rawDate = params.date == null ? '' : String(params.date).trim();
  let dateStr = null;
  if (rawDate !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      fail('INVALID_PARAM', `date must be in YYYY-MM-DD format, got "${rawDate}"`);
    }
    const [y, m, d] = rawDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      fail('INVALID_PARAM', `date is not a valid calendar date: ${rawDate}`);
    }
    dateStr = rawDate;
  }

  // ---- resolve fetch URL ----
  let url = HOMEPAGE;
  if (dateStr !== null && dateStr !== todayStr()) {
    const yymmdd = dateStr.slice(2).replace(/-/g, '');
    const candidates = [
      `https://www.techmeme.com/${yymmdd}/h2000`,
      `https://www.techmeme.com/${yymmdd}/h1130`,
      `https://www.techmeme.com/${yymmdd}/h0000`
    ];
    let html = null;
    for (const c of candidates) {
      html = await fetchHtml(c);
      if (html) { url = c; break; }
    }
    if (!html) {
      fail('NOT_FOUND', `No Techmeme snapshot found for ${dateStr} (tried h2000/h1130/h0000)`);
    }
  }

  // ---- fetch + parse ----
  const html = await fetchHtml(url);
  const items = parseFeed(html);
  if (items.length === 0) {
    fail('API_ERROR', 'No story clusters found — the Techmeme page structure may have changed');
  }

  // ---- slice + partial flag ----
  const partial = items.length < limit;
  const sliced = items.slice(0, limit);
  if (partial) {
    for (const it of sliced) it.partial = true;
  }
  return sliced;
}
