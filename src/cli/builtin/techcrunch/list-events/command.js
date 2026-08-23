// techcrunch/list-events — list TechCrunch events (upcoming / past / all)
// from the public WordPress REST API `tc_event` post type.
//
// The site's /events/ page renders two server-side blocks (Upcoming Events,
// Past Events), but its HTML pagination (/events/page/N/) is a NO-OP — every
// page serves identical content (verified first-hand). The WP REST API
// reproduces both blocks exactly and supports real pagination, so it is the
// data source:
//   - upcoming: `orderby=upcoming_events` returns exactly the site's upcoming
//     set, ascending by start date.
//   - past:     fetch all events, keep tc_event_start < today, sort by start
//     date descending (matches the site's Past table order).
//   - all:      upcoming first, then past.
// Location comes from venue posts (tc_event_venues/{id} -> city/state). The
// site renders location differently per block, and we reproduce that:
//   - upcoming cards show city (+ ", " + state) whenever a city exists;
//   - the past table shows location only when the venue has a state.
// No login, no browser required.

const EVENTS_API = "https://techcrunch.com/wp-json/wp/v2/tc_event";
const VENUES_API = "https://techcrunch.com/wp-json/wp/v2/tc_event_venues";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TYPES = ["upcoming", "past", "all"];
const MAX_LIMIT = 100;
const MAX_PER_PAGE = 100;

// Randomized pre-request delay bounds (ms), polite pacing.
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 700;

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function businessError(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// Decode the HTML entities that appear in TechCrunch event titles.
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
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Normalize a title: strip tags + collapse whitespace.
function cleanTitle(html) {
  return decodeEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Today as YYYY-MM-DD in the local timezone (used for the upcoming/past split).
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// "2026-10-13T00:00:00" -> { y, m, d } (1-based month).
function parseDate(iso) {
  const s = String(iso || "").slice(0, 10);
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { y: parts[0], m: parts[1], d: parts[2] };
}

// Render one block's date string exactly as the site does.
// upcoming uses full month names; past uses abbreviated month names.
// Same-day -> "August 19, 2026"; same-month range -> "October 13 – 15, 2026";
// cross-month -> "Feb 26 – Mar 1, 2018"; cross-year -> "Dec 30, 2017 – Jan 2, 2018".
function formatDate(startISO, endISO, fullMonth) {
  const months = fullMonth ? MONTHS_FULL : MONTHS_ABBR;
  const s = parseDate(startISO);
  if (!s) return null;
  const e = parseDate(endISO) || s;
  const single = (p) => months[p.m - 1] + " " + p.d + ", " + p.y;
  if (s.y === e.y && s.m === e.m && s.d === e.d) return single(s);
  if (s.y === e.y && s.m === e.m) {
    return months[s.m - 1] + " " + s.d + " – " + e.d + ", " + s.y;
  }
  if (s.y === e.y) {
    return months[s.m - 1] + " " + s.d + " – " + months[e.m - 1] + " " + e.d + ", " + s.y;
  }
  return single(s) + " – " + single(e);
}

// One API request with polite-pacing delay + error normalization.
// `exhausted` is true when the API reports a page beyond the last (HTTP 400).
async function apiRequest(url) {
  await sleep(MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)));

  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw businessError("NETWORK_ERROR", "Failed to fetch TechCrunch API: " + e.message);
  }

  if (response.status === 403 || response.status === 429) {
    throw businessError("RATE_LIMITED", "TechCrunch API returned HTTP " + response.status + " (rate limited / blocked; retry later)");
  }
  if (response.status === 400) {
    // Page beyond the last available page = stream exhausted, not an error.
    return { exhausted: true, items: [] };
  }
  if (!response.ok) {
    throw businessError("API_ERROR", "TechCrunch API returned HTTP " + response.status);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw businessError("DRIFT_DETECTED", "TechCrunch API returned an unparsable body: " + e.message);
  }
  if (!Array.isArray(data)) {
    throw businessError("DRIFT_DETECTED", "TechCrunch API response shape changed (expected an array)");
  }
  return { exhausted: false, items: data };
}

// Fields we need from each event (dotted _fields keeps the payload minimal).
function eventFields() {
  return "id,slug,link,title,meta.tc_event_start,meta.tc_event_end,meta.tc_event_venues";
}

// Fetch ALL events by paging the API (per_page=100). Used for past/all.
async function fetchAllEvents() {
  const collected = [];
  let page = 1;
  for (;;) {
    const url =
      EVENTS_API +
      "?per_page=" + MAX_PER_PAGE +
      "&page=" + page +
      "&_fields=" + eventFields();
    const res = await apiRequest(url);
    if (res.exhausted) break;
    collected.push(...res.items);
    // A short page means the stream is exhausted.
    if (res.items.length < MAX_PER_PAGE) break;
    page += 1;
  }
  return collected;
}

// Fetch upcoming events via the site's custom orderby. Returns at most `limit`.
async function fetchUpcoming(limit) {
  const collected = [];
  let page = 1;
  while (collected.length < limit) {
    const url =
      EVENTS_API +
      "?orderby=upcoming_events" +
      "&per_page=" + Math.min(MAX_PER_PAGE, limit - collected.length) +
      "&page=" + page +
      "&_fields=" + eventFields();
    const res = await apiRequest(url);
    if (res.exhausted) break;
    if (res.items.length === 0) break;
    collected.push(...res.items);
    if (res.items.length < MAX_PER_PAGE) break;
    page += 1;
  }
  return collected.slice(0, limit);
}

// Resolve venue ids -> { city, state } using batched include requests.
async function resolveVenues(ids) {
  const unique = [...new Set(ids)].filter((x) => x != null);
  const map = {};
  // WP REST `include` accepts many ids, but batch to keep URLs sane.
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const url =
      VENUES_API +
      "?per_page=100" +
      "&include=" + chunk.join(",") +
      "&_fields=id,slug,meta";
    const res = await apiRequest(url);
    if (res.exhausted) continue;
    for (const v of res.items) {
      const m = v.meta || {};
      map[v.id] = {
        city: String(m._tc_venue_city || "").trim(),
        state: String(m._tc_venue_state || "").trim(),
      };
    }
  }
  return map;
}

export default async function (params) {
  // Validate type on the raw string first.
  const rawType = params.type;
  if (rawType === undefined || rawType === null || String(rawType).trim() === "") {
    throw businessError("INVALID_PARAM", "type is required. Available: upcoming (即将举办), past (已结束), all (全部)");
  }
  const type = String(rawType).trim().toLowerCase();
  if (TYPES.indexOf(type) === -1) {
    throw businessError(
      "INVALID_PARAM",
      'Invalid type "' + rawType + '". Available: upcoming (即将举办), past (已结束), all (全部)'
    );
  }

  // Validate limit: regex on the raw string first so parseInt cannot truncate.
  const rawLimit = params.limit;
  if (rawLimit === undefined || rawLimit === null || !/^\d+$/.test(String(rawLimit).trim())) {
    throw businessError("INVALID_PARAM", "limit must be an integer between 1 and " + MAX_LIMIT);
  }
  const limit = parseInt(String(rawLimit).trim(), 10);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw businessError("INVALID_PARAM", "limit must be an integer between 1 and " + MAX_LIMIT);
  }

  const today = todayStr();

  // Collect raw events per type.
  let upcomingRaw = [];
  let pastRaw = [];

  if (type === "upcoming") {
    upcomingRaw = await fetchUpcoming(limit);
  } else if (type === "past") {
    const all = await fetchAllEvents();
    pastRaw = all.filter((e) => {
      const start = String((e.meta && e.meta.tc_event_start) || "").slice(0, 10);
      return start !== "" && start < today;
    });
  } else {
    // type === "all": upcoming first, then past.
    upcomingRaw = await fetchUpcoming(limit);
    const all = await fetchAllEvents();
    pastRaw = all.filter((e) => {
      const start = String((e.meta && e.meta.tc_event_start) || "").slice(0, 10);
      return start !== "" && start < today;
    });
  }

  // Sort: upcoming ascending by start date, past descending by start date.
  const startKey = (e) => String((e.meta && e.meta.tc_event_start) || "");
  upcomingRaw.sort((a, b) => startKey(a).localeCompare(startKey(b)));
  pastRaw.sort((a, b) => startKey(b).localeCompare(startKey(a)));

  // Interleave: all = upcoming first, then past. Take `limit` total.
  let ordered;
  if (type === "all") {
    ordered = upcomingRaw.concat(pastRaw);
  } else if (type === "upcoming") {
    ordered = upcomingRaw;
  } else {
    ordered = pastRaw;
  }
  const selected = ordered.slice(0, limit);

  // Resolve venues for the selected events.
  const venueIds = [];
  for (const e of selected) {
    const arr = (e.meta && e.meta.tc_event_venues) || [];
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (v && v.id != null) venueIds.push(v.id);
      }
    }
  }
  const venueMap = await resolveVenues(venueIds);

  // Build output.
  const events = selected.map((e) => {
    const meta = e.meta || {};
    const status = String(meta.tc_event_start || "").slice(0, 10) >= today ? "upcoming" : "past";
    const venues = Array.isArray(meta.tc_event_venues) ? meta.tc_event_venues : [];
    const venue = venues.find((v) => v && venueMap[v.id] && venueMap[v.id].city);
    let location = null;
    if (venue && venueMap[venue.id]) {
      const { city, state } = venueMap[venue.id];
      if (status === "upcoming") {
        location = state ? city + ", " + state : city;
      } else {
        // The site's past table shows location only when the venue has a state.
        if (state) location = city + ", " + state;
      }
    }
    return {
      name: cleanTitle((e.title && e.title.rendered) || ""),
      url: e.link || "",
      date: formatDate(meta.tc_event_start, meta.tc_event_end, status === "upcoming"),
      location,
      status,
    };
  });

  // partial = the requested limit was not fully satisfied.
  const partial = events.length < limit;

  return { events, count: events.length, partial };
}
