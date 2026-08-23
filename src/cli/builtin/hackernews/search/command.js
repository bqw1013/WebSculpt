// hackernews/search — search HackerNews via the public Algolia API (hn.algolia.com).
// Verified path: GET /api/v1/search (relevance) and /api/v1/search_by_date (latest).
// No API key, no login, no browser.

const BASE = "https://hn.algolia.com/api/v1";
const MAX_LIMIT = 1000; // Algolia pagination window: page*hitsPerPage <= 1000 (verified).
const TYPES = ["story", "comment", "ask_hn", "show_hn"];
const TIME_WINDOWS = { day: 86400, week: 604800, month: 2592000, year: 31536000 };

function fail(code, message) {
	const err = new Error(`[${code}] ${message}`);
	err.code = code;
	throw err;
}

function mapHit(hit, requestedType) {
	const type = hit._tags && hit._tags[0] ? hit._tags[0] : requestedType;
	const isComment = type === "comment";
	return {
		objectID: hit.objectID,
		type,
		title: hit.title || null,
		url: hit.url || null,
		contentUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
		author: hit.author || null,
		authorUrl: hit.author ? `https://news.ycombinator.com/user?id=${hit.author}` : null,
		publishedAt: hit.created_at || null,
		createdAtI: typeof hit.created_at_i === "number" ? hit.created_at_i : null,
		metrics: {
			points: typeof hit.points === "number" ? hit.points : null,
			comments: isComment ? null : (typeof hit.num_comments === "number" ? hit.num_comments : null)
		},
		text: isComment ? (hit.comment_text || null) : (hit.story_text || null),
		parentId: isComment && hit.parent_id != null ? hit.parent_id : null,
		storyId: isComment && hit.story_id != null ? hit.story_id : null,
		storyTitle: isComment ? (hit.story_title || null) : null,
		storyUrl: isComment ? (hit.story_url || null) : null,
		// Platform-native extras kept for full extraction (trimming happens downstream).
		children: Array.isArray(hit.children) ? hit.children : null,
		tags: Array.isArray(hit._tags) ? hit._tags : null,
		highlight: hit._highlightResult || null,
		updatedAt: hit.updated_at || null
	};
}

export default async function(params) {
	const query = params.query;
	if (query == null || query.trim() === "") {
		fail("MISSING_PARAM", "required parameter 'query' is missing or empty");
	}

	const limitText = params.limit === undefined || params.limit === "" ? "20" : String(params.limit).trim();
	if (!/^\d+$/.test(limitText) || !Number.isSafeInteger(Number(limitText)) || Number(limitText) < 1) {
		fail("INVALID_PARAM", `limit must be a positive integer, got '${params.limit}'`);
	}
	const limit = Number(limitText);
	if (limit > MAX_LIMIT) {
		fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT} (Algolia pagination window)`);
	}

	if (!TYPES.includes(params.type)) {
		fail("INVALID_PARAM", `type must be one of ${TYPES.join("/")}, got '${params.type}'`);
	}

	const ignoredParams = [];
	let endpoint;
	if (params.sort === "latest") {
		endpoint = `${BASE}/search_by_date`;
	} else if (params.sort === "default") {
		endpoint = `${BASE}/search`;
	} else if (params.sort === "popular") {
		// Algolia HN API has no popularity sort endpoint; relevance (default) is points-weighted.
		endpoint = `${BASE}/search`;
		ignoredParams.push("sort");
	} else {
		fail("INVALID_PARAM", `sort must be default/latest/popular, got '${params.sort}'`);
	}

	const qs = new URLSearchParams({
		query,
		tags: params.type,
		hitsPerPage: String(limit)
	});
	if (params.time && params.time !== "all") {
		const windowSec = TIME_WINDOWS[params.time];
		if (!windowSec) {
			fail("INVALID_PARAM", `time must be day/week/month/year/all, got '${params.time}'`);
		}
		const threshold = Math.floor(Date.now() / 1000) - windowSec;
		qs.set("numericFilters", `created_at_i>${threshold}`);
	}

	const url = `${endpoint}?${qs.toString()}`;
	let res;
	try {
		res = await fetch(url, { headers: { "User-Agent": "websculpt-hackernews-search" } });
	} catch (e) {
		fail("UPSTREAM_ERROR", `failed to reach hn.algolia.com: ${e.message}`);
	}
	if (!res.ok) {
		fail("UPSTREAM_ERROR", `Algolia API returned HTTP ${res.status} for ${url}`);
	}

	const data = await res.json();
	if (!data || !Array.isArray(data.hits)) {
		fail("DRIFT_DETECTED", "response missing top-level 'hits' array; Algolia API schema may have changed");
	}

	const results = data.hits.map((h) => mapHit(h, params.type));
	const out = {
		results,
		count: results.length,
		nbHits: typeof data.nbHits === "number" ? data.nbHits : null,
		query,
		type: params.type,
		sort: params.sort,
		time: params.time,
		maxLimit: MAX_LIMIT
	};
	if (ignoredParams.length > 0) out.ignoredParams = ignoredParams;
	return out;
}
