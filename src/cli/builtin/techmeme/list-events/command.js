// techmeme/list-events — list upcoming tech events and earnings days from the
// Techmeme events calendar page (https://www.techmeme.com/events).
//
// The page is a single server-rendered list (verified ~144 rows covering
// roughly five months), no pagination. Each row has one shape:
//   <div class="[featured ][nf ]ne"><div class="rhov"><a href="/r2/...">
//     <div>date-range</div><div>name [<em>VIRTUAL:|HYBRID:</em>][<span>CTA</span>]</div>
//     <div>location</div></a></div></div>
// - outer class token `featured` marks a sponsored row (featured:true)
// - VIRTUAL/HYBRID prefix lives in an <em> inside the NAME div (kept in name)
// - Earnings days start with "Earnings: "; their location div is empty
// - /r2/ hrefs are Techmeme's redirect shell (meta-refresh to the official
//   page); returned as-is, never resolved per row (144 extra requests).
// No login, no browser, no API key.

const EVENTS_URL = "https://www.techmeme.com/events";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Randomized pre-request delay bounds (ms), courtesy delay.
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function businessError(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// Decode the HTML entities that appear on the events page.
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
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Normalize a plain text field (date range / location): decode + strip tags.
function cleanText(html) {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize an event name: keep the VIRTUAL:/HYBRID: prefix text, drop the
// styling <em>, drop the featured CTA <span>, then decode and strip tags.
function cleanName(html) {
  return String(html || "")
    .replace(/<em[^>]*>(VIRTUAL|HYBRID):<\/em>/gi, "$1:")
    .replace(/<span[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

// One fetch with courtesy delay + error normalization.
async function fetchEventsHtml() {
  await sleep(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));

  let response;
  try {
    response = await fetch(EVENTS_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw businessError("NETWORK_ERROR", "Failed to fetch Techmeme events page: " + e.message);
  }

  if (response.status === 403 || response.status === 429) {
    throw businessError(
      "RATE_LIMITED",
      "Techmeme events page returned HTTP " + response.status + " (rate limited / blocked; retry later)"
    );
  }
  if (!response.ok) {
    throw businessError("API_ERROR", "Techmeme events page returned HTTP " + response.status);
  }

  let html;
  try {
    html = await response.text();
  } catch (e) {
    throw businessError("DRIFT_DETECTED", "Techmeme events page returned an unreadable body: " + e.message);
  }
  return html;
}

// Extract the <DIV ID="events"> container and parse each event row.
function parseEvents(html) {
  const containerMatch = html.match(/<DIV ID="events">([\s\S]*?)<\/DIV>/);
  if (!containerMatch) {
    throw businessError(
      "DRIFT_DETECTED",
      'Techmeme events container (<DIV ID="events">) not found — page structure changed'
    );
  }
  const container = containerMatch[1];

  const rowRe =
    /<div class="([^"]*)"><div class="rhov"><a href="([^"]+)"><div>([\s\S]*?)<\/div><div>([\s\S]*?)<\/div><div>([\s\S]*?)<\/div><\/a><\/div><\/div>/g;
  const events = [];
  let row;
  while ((row = rowRe.exec(container)) !== null) {
    events.push({
      date_range: cleanText(row[3]),
      name: cleanName(row[4]),
      location: cleanText(row[5]),
      url: row[2],
      featured: /featured/.test(row[1]),
    });
  }
  if (events.length === 0) {
    throw businessError(
      "DRIFT_DETECTED",
      "Techmeme events container found but no event rows matched — row markup changed"
    );
  }
  return events;
}

export default async function (params) {
  // Validate limit on the raw string first so parseInt cannot truncate.
  const rawLimit = params.limit;
  if (rawLimit === undefined || rawLimit === null || !/^\d+$/.test(String(rawLimit).trim())) {
    throw businessError(
      "INVALID_PARAM",
      "limit must be an integer between 1 and " + MAX_LIMIT + " (default " + DEFAULT_LIMIT + ")"
    );
  }
  const limit = parseInt(String(rawLimit).trim(), 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw businessError(
      "INVALID_PARAM",
      "limit must be an integer between 1 and " + MAX_LIMIT + " (default " + DEFAULT_LIMIT + ")"
    );
  }

  const html = await fetchEventsHtml();
  const all = parseEvents(html);
  const selected = all.slice(0, limit);

  // The contract output is a bare array. `partial` marks a stream exhausted
  // before the requested limit was reached — then every returned item carries
  // partial:true; otherwise the field is omitted.
  if (all.length < limit) {
    return selected.map((item) => Object.assign({}, item, { partial: true }));
  }
  return selected;
}
