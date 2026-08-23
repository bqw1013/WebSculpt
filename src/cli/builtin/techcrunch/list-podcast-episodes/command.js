// techcrunch/list-podcast-episodes — list episodes of a TechCrunch podcast
// via the public WordPress REST API (tc_podcast post type + tc_podcast_type taxonomy).
// No auth, no browser required.

// The three shows (enum), as listed on https://techcrunch.com/podcasts/.
const SHOWS = ["equity", "build-mode", "strictlyvc-download"];

// Dotted _fields keeps the response to exactly the keys we map below.
const EPISODE_FIELDS =
  "id,date,link,title,yoast_head_json.description,content.rendered";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Decode HTML entities (named subset + numeric decimal/hex) to plain text.
function decodeEntities(str) {
  if (!str) return "";
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
    bull: "•",
    copy: "©",
    reg: "®",
    trade: "™",
    deg: "°",
    times: "×",
    divide: "÷",
  };
  return str.replace(
    /&#x([0-9a-fA-F]+);|&#(\d+);|&([a-zA-Z]+);/g,
    (m, hex, dec, name) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      return named[name] !== undefined ? named[name] : m;
    }
  );
}

// Shared fetch with User-Agent, network + status error normalization.
async function apiFetch(url) {
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Request to TechCrunch API failed: " + e.message);
    err.code = "NETWORK_ERROR";
    throw err;
  }
  if (!res.ok) {
    const err = new Error("[API_ERROR] TechCrunch API returned HTTP " + res.status);
    err.code = "API_ERROR";
    throw err;
  }
  return res;
}

// Resolve a show slug to its taxonomy term id/name/count.
async function resolveShow(show) {
  const url =
    "https://techcrunch.com/wp-json/wp/v2/tc_podcast_type?slug=" +
    encodeURIComponent(show) +
    "&_fields=id,name,count";
  const res = await apiFetch(url);
  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error("[DRIFT_DETECTED] TechCrunch API returned an unparsable term response");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  if (!Array.isArray(data)) {
    const err = new Error("[DRIFT_DETECTED] TechCrunch term response shape changed (expected array)");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  if (data.length === 0) {
    const err = new Error("[NOT_FOUND] Podcast show '" + show + "' not found on TechCrunch");
    err.code = "NOT_FOUND";
    throw err;
  }
  const term = data[0];
  if (!term.id || !term.name) {
    const err = new Error("[DRIFT_DETECTED] TechCrunch term response missing id/name");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  return { id: term.id, name: term.name, count: term.count || 0 };
}

// Fetch episodes for a show term. per_page <= 100, and limit <= 100, so a single
// request always covers the requested range.
async function fetchEpisodes(termId, limit) {
  const url =
    "https://techcrunch.com/wp-json/wp/v2/tc_podcast?tc_podcast_type=" +
    termId +
    "&per_page=" +
    limit +
    "&page=1&_fields=" +
    EPISODE_FIELDS;
  const res = await apiFetch(url);
  const total = parseInt(res.headers.get("X-WP-Total") || "0", 10);
  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error("[DRIFT_DETECTED] TechCrunch API returned an unparsable episodes response");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  if (!Array.isArray(data)) {
    const err = new Error("[DRIFT_DETECTED] TechCrunch episodes response shape changed (expected array)");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  return { episodes: data, total };
}

// Extract the Megaphone embed (player) URL from the show-notes HTML.
function extractAudioUrl(contentHtml) {
  if (!contentHtml) return null;
  const m = contentHtml.match(/https:\/\/playlist\.megaphone\.fm\/?\?e=[A-Z0-9]+/i);
  return m ? m[0] : null;
}

// Fallback description: first <p> of the show notes, stripped to plain text.
// Used only when the Yoast meta description is absent (e.g. build-mode episodes).
function firstParagraphText(html, maxLen) {
  if (!html) return "";
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!m) return "";
  let text = m[1].replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen || 300);
}

export default async function (params) {
  // Validate show (runner supplies the manifest default "equity").
  const show = (params.show || "").trim().toLowerCase();
  if (SHOWS.indexOf(show) === -1) {
    const err = new Error(
      "[INVALID_PARAM] Invalid show '" +
        params.show +
        "'. Available shows: equity (创投周谈), build-mode (创业实操), strictlyvc-download (VC访谈)"
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Validate limit: regex on the raw string first, then numeric range.
  const rawLimit = (params.limit || "20").trim();
  if (!/^\d+$/.test(rawLimit)) {
    const err = new Error("[INVALID_PARAM] limit must be a positive integer (1-100)");
    err.code = "INVALID_PARAM";
    throw err;
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Polite pacing: random 200-700ms sleep before each request.
  await sleep(200 + Math.floor(Math.random() * 500));

  const term = await resolveShow(show);

  await sleep(200 + Math.floor(Math.random() * 500));

  const { episodes, total } = await fetchEpisodes(term.id, limit);

  const items = episodes.map((ep) => {
    const titleHtml = (ep.title && ep.title.rendered) || "";
    const contentHtml = (ep.content && ep.content.rendered) || "";
    const yoastDesc =
      (ep.yoast_head_json && ep.yoast_head_json.description) || "";
    return {
      title: decodeEntities(titleHtml).replace(/\s+/g, " ").trim(),
      url: ep.link || null,
      date: ep.date || null,
      description: yoastDesc || firstParagraphText(contentHtml, 300),
      audioUrl: extractAudioUrl(contentHtml),
    };
  });

  return {
    show: { slug: show, name: term.name, episodeCount: total },
    episodes: items,
    count: items.length,
    partial: items.length < limit,
  };
}
