// vimeo/get-category — list videos in a Vimeo category.
// Data source: public SSR category list pages (vimeo.com/categories/{cat}/videos).
// Node runtime; no login, no API key, no browser required.
// Card extraction requires the /format:detail page variant (default thumbnail
// cards lack duration/author/views).

const CATEGORIES = [
	"animation", "adsandcommercials", "brandedcontent", "comedy",
	"documentary", "experimental", "music", "narrative", "sports", "travel"
];
const SORTS = ["featured", "relevant", "date", "alphabetical", "plays", "likes", "duration"];
const MAX_LIMIT = 100;
const PAGE_SIZE = 18;
const MAX_PAGES = 12; // safety cap; limit<=100 needs at most 6 pages
const BASE = "https://vimeo.com/categories";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MIN_SLEEP_MS = 200;
const MAX_SLEEP_MS = 700;

// Common HTML named entities seen in Vimeo titles/authors; numeric entities are
// decoded generically. Unrecognized named entities are left untouched.
const NAMED_ENTITIES = {
	amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
	ndash: "–", mdash: "—", hellip: "…", bull: "•",
	lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
	copy: "©", reg: "®", trade: "™", deg: "°", plusmn: "±", times: "×",
	Eacute: "É", Uacute: "Ú", Iacute: "Í", Oacute: "Ó", Aacute: "Á",
	Agrave: "À", Egrave: "È", Ugrave: "Ù", Ntilde: "Ñ", Ouml: "Ö", Uuml: "Ü", Auml: "Ä",
	eacute: "é", uacute: "ú", iacute: "í", oacute: "ó", aacute: "á",
	agrave: "à", egrave: "è", ugrave: "ù", ntilde: "ñ", ouml: "ö", uuml: "ü", auml: "ä",
	ccedil: "ç", Ccedil: "Ç", aring: "å", Aring: "Å"
};

function fail(code, message) {
	const err = new Error(`[${code}] ${message}`);
	err.code = code;
	throw err;
}

function randomSleep() {
	const ms = MIN_SLEEP_MS + Math.floor(Math.random() * (MAX_SLEEP_MS - MIN_SLEEP_MS + 1));
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(str) {
	if (!str) return str;
	return str
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m));
}

function cleanText(str) {
	if (!str) return null;
	const cleaned = decodeEntities(str).replace(/\s+/g, " ").trim();
	return cleaned === "" ? null : cleaned;
}

function buildUrl(category, sort, page) {
	const parts = [`${BASE}/${category}/videos`];
	if (page > 1) parts.push(`page:${page}`);
	parts.push(`sort:${sort}`);
	parts.push("format:detail");
	return parts.join("/");
}

async function fetchHtml(url) {
	// Polite pacing: random sleep before every request (200-700ms).
	await randomSleep();
	let lastStatus = 0;
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const res = await fetch(url, {
			headers: {
				"User-Agent": UA,
				"Accept": "text/html,application/xhtml+xml",
				"Accept-Language": "en-US,en;q=0.9"
			},
			redirect: "follow"
		});
		lastStatus = res.status;
		if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 2) {
			await randomSleep();
			continue;
		}
		const html = await res.text();
		if (res.status === 404 || html.includes("VimeUhOh")) {
			fail("NOT_FOUND", `Category page not found: ${url}`);
		}
		if (!res.ok) {
			fail("HTTP_ERROR", `Vimeo returned HTTP ${res.status} for ${url}`);
		}
		if (html.includes("Just a moment") || html.includes("challenge-platform")) {
			fail("ANTI_BOT", "Vimeo served a challenge page — slow down and retry");
		}
		return html;
	}
	fail("HTTP_ERROR", `Vimeo request failed after retries (last status ${lastStatus}): ${url}`);
}

// Extract real video cards. Placeholder cards (no video link, e.g. default
// thumbnail for removed/private videos) are skipped.
function extractCards(html) {
	const cards = [];
	const liRe = /<li[^>]*id="clip_(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
	let m;
	while ((m = liRe.exec(html)) !== null) {
		const id = m[1];
		const block = m[2];
		const hrefMatch = block.match(/href="\/(\d+)"/);
		if (!hrefMatch) continue; // placeholder card without a video link
		const titleMatch = block.match(/<p class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
		const durMatch = block.match(/<div class="duration">([^<]+)<\/div>/);
		const authorMatch = block.match(/from <a href="([^"]+)">([\s\S]*?)<\/a>/);
		const viewsMatch = block.match(/title="Views">\s*([^<]+?)\s*<\/span>/);
		const thumbMatch = block.match(/<img src="(https:\/\/i\.vimeocdn\.com\/[^"]+)"/);
		cards.push({
			id,
			title: cleanText(titleMatch ? titleMatch[1] : null),
			url: `https://vimeo.com/${hrefMatch[1]}`,
			duration: durMatch ? durMatch[1].trim() : null,
			author: authorMatch ? { name: cleanText(authorMatch[2]), url: authorMatch[1] } : null,
			views: viewsMatch ? viewsMatch[1].trim() : null,
			thumbnail: thumbMatch ? thumbMatch[1] : null
		});
	}
	return cards;
}

function hasNextPage(html) {
	return /rel=["']next["']/.test(html);
}

export default async function (params) {
	const rawCategory = params.category;
	if (rawCategory === undefined || String(rawCategory).trim() === "") {
		fail("MISSING_PARAM", "category is required");
	}
	const category = String(rawCategory).trim().toLowerCase();
	if (!CATEGORIES.includes(category)) {
		fail("INVALID_PARAM", `category must be one of: ${CATEGORIES.join(", ")}`);
	}

	const rawSort = params.sort;
	const sort = String(rawSort).trim().toLowerCase();
	if (!SORTS.includes(sort)) {
		fail("INVALID_PARAM", `sort must be one of: ${SORTS.join(", ")}`);
	}

	const rawLimit = String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit)) {
		fail("INVALID_PARAM", "limit must be a positive integer");
	}
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) {
		fail("INVALID_PARAM", "limit must be a positive integer");
	}
	if (limit > MAX_LIMIT) {
		fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);
	}

	const records = [];
	const seen = new Set();
	let pagesFetched = 0;
	let partial = false;
	let driftOnEmpty = false;

	for (let page = 1; page <= MAX_PAGES; page += 1) {
		if (records.length >= limit) break;
		const html = await fetchHtml(buildUrl(category, sort, page));
		pagesFetched = page;
		const cards = extractCards(html);
		if (page === 1 && cards.length === 0) {
			if (!html.includes("js-browse_list")) {
				// Page structure marker missing — likely a layout change.
				driftOnEmpty = true;
				break;
			}
			// Valid page but genuinely no videos in this category/sort.
			partial = true;
			break;
		}
		let newCount = 0;
		for (const card of cards) {
			if (!seen.has(card.id)) {
				seen.add(card.id);
				newCount += 1;
				records.push(card);
			}
		}
		if (records.length >= limit) break; // reached the requested limit; not partial
		// Exhausted when: no real cards, no next page, or nothing new on this page.
		if (cards.length === 0 || !hasNextPage(html) || newCount === 0) {
			partial = true;
			break;
		}
	}

	if (pagesFetched === MAX_PAGES && records.length < limit) {
		// Hit the safety page cap without reaching limit.
		partial = true;
	}

	const videos = records.slice(0, limit);
	const result = {
		category,
		sort,
		maxLimit: MAX_LIMIT,
		resultCount: videos.length,
		pagesFetched,
		videos
	};
	if (partial) result.partial = true;
	if (driftOnEmpty) {
		fail("DRIFT_DETECTED", `Vimeo category page returned no video cards: ${BASE}/${category}/videos`);
	}
	return result;
}
