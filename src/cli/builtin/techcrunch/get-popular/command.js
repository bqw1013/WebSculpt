// techcrunch/get-popular
//
// Fetch TechCrunch's "Most Popular" module — the most-read articles of the
// last few days shown in the sidebar of the techcrunch.com homepage. The
// module is server-rendered only on the homepage; there is no standalone page
// and no API for it, so this command downloads the homepage HTML and parses
// the module. It holds about 5-10 items (the observed range), and the limit is
// capped at 20 because the module can never contain more than that.
//
// Data source: https://techcrunch.com/ (public, no login, no browser).
// Runtime: node. We use the global `fetch` (undici) — TechCrunch serves the
// homepage to plain HTTP clients (verified: a plain fetch returns HTTP 200
// with the full server-rendered HTML). A randomized
// 200-700ms delay is applied before the request as polite pacing
// (single request, so it does not noticeably slow the command down).

const HOMEPAGE = "https://techcrunch.com/";
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 700;
const MAX_LIMIT = 20;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function businessError(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// Decode the HTML entities that appear in TechCrunch titles/authors.
function decodeEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/gi, "…")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(str) {
  return String(str || "").replace(/<[^>]+>/g, "");
}

// Given the index of an opening tag, find the index just past its matching
// closing tag, using a depth counter over open/close tags of the same element.
// Returns -1 if no matching close is found.
function findElementEnd(html, openIndex, openRe, closeTag) {
  const closeRe = new RegExp(closeTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  openRe.lastIndex = openIndex;
  closeRe.lastIndex = openIndex;
  const events = [];
  let m;
  while ((m = openRe.exec(html)) !== null) events.push({ i: m.index, t: 1 });
  while ((m = closeRe.exec(html)) !== null) events.push({ i: m.index, t: -1 });
  events.sort((a, b) => a.i - b.i);
  let depth = 0;
  for (const e of events) {
    depth += e.t;
    if (depth === 0) return e.i + closeTag.length;
  }
  return -1;
}

// Extract every <a ...>...</a> anchor from a chunk as { href, className, text }.
// href/class may appear in any attribute order, so both are read from the tag.
function extractAnchors(chunk) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(chunk)) !== null) {
    const attrs = m[1] || "";
    const hrefM = /href="([^"]*)"/.exec(attrs);
    const clsM = /class="([^"]*)"/.exec(attrs);
    out.push({
      href: hrefM ? hrefM[1] : null,
      className: clsM ? clsM[1] : "",
      text: decodeEntities(stripTags(m[2])).trim(),
    });
  }
  return out;
}

// Extract the Most Popular article cards from the homepage HTML.
// Returns:
//   - null if the module container is absent (page structure changed)
//   - an array of cards otherwise (possibly empty)
function extractPopular(html) {
  // The module container is the only div whose class begins with
  // "wp-block-group wp-block-techcrunch-most-popular-posts" followed by a space
  // or the closing quote. The related __heading / __icon divs use an
  // underscore suffix and are excluded by the (?=\s|") boundary.
  const containerRe = /<div\b[^>]*class="wp-block-group wp-block-techcrunch-most-popular-posts(?=\s|")[^>]*>/;
  const cMatch = containerRe.exec(html);
  if (!cMatch) return null;
  const cEnd = findElementEnd(html, cMatch.index, /<div\b[^>]*>/g, "</div>");
  if (cEnd === -1) return null;
  const container = html.slice(cMatch.index, cEnd);

  const ulRe = /<ul\b[^>]*class="[^"]*wp-block-post-template[^"]*"[^>]*>/;
  const uMatch = ulRe.exec(container);
  if (!uMatch) return [];
  const uEnd = findElementEnd(container, uMatch.index, /<ul\b[^>]*>/g, "</ul>");
  if (uEnd === -1) return [];
  const ulHtml = container.slice(uMatch.index, uEnd);

  const liOpenRe = /<li\b[^>]*class="[^"]*wp-block-post[^"]*"[^>]*>/g;
  const liOpens = [];
  let lm;
  while ((lm = liOpenRe.exec(ulHtml)) !== null) liOpens.push(lm.index);

  const items = liOpens.map((openIdx) => {
    const end = findElementEnd(ulHtml, openIdx, /<li\b[^>]*>/g, "</li>");
    const li = ulHtml.slice(openIdx, end);
    const anchors = extractAnchors(li);
    const titleA = anchors.find((a) => a.className.indexOf("loop-card__title-link") !== -1) || null;
    const authorA = anchors.find((a) => a.className.indexOf("loop-card__author") !== -1) || null;
    return {
      title: titleA ? titleA.text : null,
      url: titleA ? titleA.href : null,
      author: {
        name: authorA ? authorA.text : null,
        profileUrl: authorA ? authorA.href : null,
      },
      // The Most Popular cards show no publish date (no <time>/[datetime] in the
      // module); the field is kept for schema consistency and is always null.
      date: null,
    };
  });

  return items;
}

export default async function (params) {
  // Validate limit on the raw string first (reject "5abc", "1.5", "-3", "" ...)
  // so parseInt cannot silently truncate invalid input.
  const rawLimit = params.limit;
  if (rawLimit === undefined || rawLimit === null || !/^\d+$/.test(String(rawLimit))) {
    throw businessError("INVALID_PARAM", "limit must be an integer between 1 and 20");
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw businessError("INVALID_PARAM", "limit must be an integer between 1 and 20 (the Most Popular module only holds about 5-10 items)");
  }

  // Polite pacing: randomized 200-700ms delay before the single homepage request.
  await sleep(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));

  let response;
  try {
    response = await fetch(HOMEPAGE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw businessError("NETWORK_ERROR", "Failed to fetch TechCrunch homepage: " + e.message);
  }

  if (response.status === 403 || response.status === 429) {
    throw businessError("RATE_LIMITED", "TechCrunch homepage returned HTTP " + response.status + " (rate limited / blocked; retry later)");
  }
  if (response.status === 404) {
    throw businessError("NOT_FOUND", "TechCrunch homepage not found (HTTP 404)");
  }
  if (!response.ok) {
    throw businessError("API_ERROR", "TechCrunch homepage returned HTTP " + response.status);
  }

  let html;
  try {
    html = await response.text();
  } catch (e) {
    throw businessError("PARSE_ERROR", "Failed to read TechCrunch homepage response: " + e.message);
  }

  // A real homepage is a large HTML document. A bot/block page is small and has
  // no <html> opener in its head — report drift rather than return empty.
  if (html.length < 500 && html.slice(0, 4000).toLowerCase().indexOf("<html") === -1) {
    throw businessError("DRIFT_DETECTED", "TechCrunch homepage returned an unexpected (non-HTML) response");
  }

  const items = extractPopular(html);
  if (items === null) {
    throw businessError(
      "DRIFT_DETECTED",
      "Most Popular module not found on the TechCrunch homepage (page structure may have changed)"
    );
  }
  if (items.length === 0) {
    throw businessError("EMPTY_RESULT", "The Most Popular module is present but contains no articles");
  }

  const articles = items.slice(0, limit);
  // partial=true when the module held fewer items than the requested limit.
  const partial = articles.length < limit;

  return { articles, partial };
}
