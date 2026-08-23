// techmeme/get-timeline: fetch Techmeme River's reverse-chronological timeline.
// Single source: https://www.techmeme.com/river — one static HTML request per
// invocation (no login, no browser). The page is a rolling ~6-day window whose
// item count floats with posting volume (observed 153). The command returns the
// newest `limit` entries; when `limit` exceeds the number actually on the page,
// it returns all entries and marks every returned item `partial: true`.

const RIVER_URL = "https://www.techmeme.com/river";
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MIN_SLEEP_MS = 200;
const MAX_SLEEP_MS = 700;
const FETCH_TIMEOUT_MS = 30000;
const LIMIT_MIN = 1;
const LIMIT_MAX = 200;

// Full month names Techmeme uses for day-group H2s, e.g. "August 19, 2026".
const DATE_RE =
	/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/;

function decodeEntities(s) {
	if (!s) return s;
	return s
		.replace(/&#x([0-9a-f]+);/gi, (m, hex) => {
			try {
				return String.fromCodePoint(parseInt(hex, 16));
			} catch {
				return m;
			}
		})
		.replace(/&#(\d+);/g, (m, dec) => {
			try {
				return String.fromCodePoint(parseInt(dec, 10));
			} catch {
				return m;
			}
		})
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&ldquo;/g, "“")
		.replace(/&rdquo;/g, "”")
		.replace(/&lsquo;/g, "‘")
		.replace(/&rsquo;/g, "’")
		.replace(/&mdash;/g, "—")
		.replace(/&ndash;/g, "–")
		.replace(/&hellip;/g, "…")
		.replace(/&bull;/g, "•")
		.replace(/&middot;/g, "·")
		.replace(/&copy;/g, "©")
		.replace(/&reg;/g, "®")
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function stripTags(s) {
	return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cellText(raw) {
	return decodeEntities(stripTags(raw)).replace(/\s+/g, " ").trim();
}

// Random 200-700ms sleep before each request (project polite pacing policy).
function randomSleep() {
	const delay =
		MIN_SLEEP_MS + Math.floor(Math.random() * (MAX_SLEEP_MS - MIN_SLEEP_MS + 1));
	return new Promise((resolve) => setTimeout(resolve, delay));
}

// `limit` is a number param: validate the raw string before parseInt so the
// integer is never silently truncated; out-of-range values are INVALID_PARAM.
function parseLimit(raw) {
	if (raw === undefined || raw === null) {
		const err = new Error("[MISSING_PARAM] Missing required parameter: limit");
		err.code = "MISSING_PARAM";
		throw err;
	}
	if (!/^\d+$/.test(raw)) {
		const err = new Error(
			"[INVALID_PARAM] limit must be an integer in [" + LIMIT_MIN + "," + LIMIT_MAX + "], got: " + raw
		);
		err.code = "INVALID_PARAM";
		throw err;
	}
	const n = parseInt(raw, 10);
	if (n < LIMIT_MIN || n > LIMIT_MAX) {
		const err = new Error(
			"[INVALID_PARAM] limit must be in [" + LIMIT_MIN + "," + LIMIT_MAX + "], got: " + n
		);
		err.code = "INVALID_PARAM";
		throw err;
	}
	return n;
}

function extractTime(rowHtml) {
	const m = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
	if (!m) return null;
	// Raw cell is like "1:15 AM &nbsp;&bull;" — drop the trailing bullet.
	return cellText(m[1]).replace(/\s*•\s*$/, "").replace(/\s+$/, "").trim();
}

// cite is "Author / Source" when both are present, or just "Source" when there
// is no author (verified ~34% of entries have author null).
function extractCite(rowHtml) {
	const m = rowHtml.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
	if (!m) return { author: null, source: null };
	let text = cellText(m[1]).replace(/:+$/, "").trim();
	const idx = text.indexOf(" / ");
	if (idx !== -1) {
		return {
			author: text.slice(0, idx).trim(),
			source: text.slice(idx + 3).trim()
		};
	}
	return { author: null, source: text };
}

// The original-article link is the <a> that follows </cite>&nbsp;.
function extractTitleLink(rowHtml) {
	const parts = rowHtml.split(/<\/cite>/i);
	const after = parts.length > 1 ? parts[1] : rowHtml;
	const m = after.match(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
	if (!m) return { url: null, title: null };
	return { url: decodeEntities(m[1]).trim(), title: cellText(m[2]) };
}

// permalink id lives on the rshr div: pml="260819p4" (yymmdd + "p" + N).
function extractPml(rowHtml) {
	const m = rowHtml.match(/\bpml="([^"]+)"/i);
	return m ? m[1] : null;
}

function parseRitem(rowHtml, date) {
	const cite = extractCite(rowHtml);
	const link = extractTitleLink(rowHtml);
	return {
		time: extractTime(rowHtml),
		date,
		title: link.title,
		author: cite.author,
		source: cite.source,
		url: link.url,
		permalink: extractPml(rowHtml)
	};
}

export default async function (params) {
	const limit = parseLimit(params.limit);

	await randomSleep();

	let res;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		res = await fetch(RIVER_URL, {
			headers: { "User-Agent": USER_AGENT },
			signal: controller.signal,
			redirect: "follow"
		});
	} catch (e) {
		const msg = e && e.message ? e.message : String(e);
		const err = new Error("[NETWORK_ERROR] Failed to fetch Techmeme River: " + msg);
		err.code = "NETWORK_ERROR";
		throw err;
	} finally {
		clearTimeout(timer);
	}

	if (res.status === 429 || res.status === 403) {
		const err = new Error("[RATE_LIMITED] Techmeme rejected the request with HTTP " + res.status);
		err.code = "RATE_LIMITED";
		throw err;
	}
	if (res.status === 404) {
		const err = new Error("[NOT_FOUND] Techmeme River page not found (HTTP 404)");
		err.code = "NOT_FOUND";
		throw err;
	}
	if (!res.ok) {
		const err = new Error("[API_ERROR] Techmeme River request failed with HTTP " + res.status);
		err.code = "API_ERROR";
		throw err;
	}

	const html = await res.text();

	// Stream through the page in document order: a date H2 sets the current day
	// group; every following <tr class="ritem"> belongs to that date. The footer
	// "Sponsor Posts" / "Featured Podcasts" H2s do not match DATE_RE and their
	// items are DIV.item blocks (not tr.ritem), so they are excluded naturally.
	const re = /<h2[^>]*>([\s\S]*?)<\/h2>|<tr\s+class="ritem">([\s\S]*?)<\/tr>/gi;
	let currentDate = null;
	const all = [];
	let m;
	while ((m = re.exec(html))) {
		if (m[1] !== undefined) {
			const h2 = cellText(m[1]);
			if (DATE_RE.test(h2)) currentDate = h2;
		} else if (m[2] !== undefined && currentDate) {
			all.push(parseRitem(m[2], currentDate));
		}
	}

	if (all.length === 0) {
		const err = new Error(
			"[DRIFT_DETECTED] Techmeme River structure changed: no tr.ritem rows found on a 200 page"
		);
		err.code = "DRIFT_DETECTED";
		throw err;
	}

	const sliced = all.slice(0, limit);
	const partial = sliced.length < limit;
	for (const item of sliced) {
		if (partial) item.partial = true;
	}
	return sliced;
}
