const API_ROOT = "https://hacker-news.firebaseio.com/v0";
const REQUEST_TIMEOUT_MS = 12000;

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

async function fetchJson(url) {
	let lastNetworkError;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (response.status === 429) fail("RATE_LIMITED", "Hacker News API returned HTTP 429");
			if (!response.ok) fail("API_ERROR", `Hacker News API returned HTTP ${response.status}`);
			try {
				return await response.json();
			} catch {
				fail("DRIFT_DETECTED", "Hacker News API returned invalid JSON");
			}
		} catch (error) {
			if (error && error.code) throw error;
			lastNetworkError = error;
			if (attempt === 1) break;
		} finally {
			clearTimeout(timer);
		}
	}
	const detail = lastNetworkError && lastNetworkError.name === "AbortError" ? "request timed out" : "request failed";
	fail("NETWORK_ERROR", `Hacker News API ${detail} after one retry`);
}

function parseId(value, name) {
	if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
		fail("INVALID_PARAM", `${name} must be a positive Hacker News item ID`);
	}
	const id = Number.parseInt(value.trim(), 10);
	if (!Number.isSafeInteger(id) || id < 1) fail("INVALID_PARAM", `${name} must be a positive Hacker News item ID`);
	return id;
}

function resolveId(params) {
	const rawId = typeof params.id === "string" ? params.id.trim() : "";
	const rawUrl = typeof params.url === "string" ? params.url.trim() : "";
	if ((rawId && rawUrl) || (!rawId && !rawUrl)) {
		fail("MISSING_PARAM", "provide exactly one of id or url");
	}
	if (rawId) return parseId(rawId, "id");
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		fail("INVALID_PARAM", "url must be a valid Hacker News item URL");
	}
	if (parsed.hostname !== "news.ycombinator.com" || parsed.pathname !== "/item") {
		fail("INVALID_PARAM", "url must be a news.ycombinator.com/item?id=... URL");
	}
	return parseId(parsed.searchParams.get("id") || "", "url id");
}

function parseLimit(value) {
	if (typeof value !== "string" || !/^\d+$/.test(value)) {
		fail("INVALID_PARAM", "limit must be an integer between 1 and 200");
	}
	const limit = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
		fail("INVALID_PARAM", "limit must be an integer between 1 and 200");
	}
	return limit;
}

function childIds(item, label) {
	if (item.kids === undefined) return [];
	if (!Array.isArray(item.kids) || item.kids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
		fail("DRIFT_DETECTED", `${label} kids is not an array of numeric IDs`);
	}
	return item.kids;
}

function isDead(item) {
	return Boolean(item && (item.deleted || item.dead));
}

export default async function(params) {
	const rootId = resolveId(params);
	const limit = parseLimit(params.limit);
	const root = await fetchJson(`${API_ROOT}/item/${rootId}.json`);
	if (!root || isDead(root)) fail("NOT_FOUND", `Hacker News item ${rootId} was not found`);
	if (root.type !== "story") fail("INVALID_ITEM", `Hacker News item ${rootId} is not a story`);
	if (!Number.isSafeInteger(root.id) || root.id !== rootId || typeof root.title !== "string" ||
		typeof root.by !== "string" || !Number.isFinite(root.time)) {
		fail("DRIFT_DETECTED", "Hacker News story is missing required fields");
	}
	const rootKids = childIds(root, "story");
	const storyUrl = typeof root.url === "string" && root.url.length > 0 ? root.url : null;
	const totalComments = Number.isFinite(root.descendants) ? root.descendants : 0;
	const comments = [];
	const seen = new Set([rootId]);
	let truncated = false;

	async function visit(ids, depth, parentId) {
		for (const id of ids) {
			if (comments.length >= limit) {
				truncated = true;
				return;
			}
			if (seen.has(id)) continue;
			seen.add(id);
			const item = await fetchJson(`${API_ROOT}/item/${id}.json`);
			if (!item) continue;
			const kids = childIds(item, `item ${id}`);
			if (isDead(item) || item.type !== "comment") {
				if (kids.length > 0) await visit(kids, depth + 1, id);
				continue;
			}
			if (!Number.isSafeInteger(item.id) || typeof item.by !== "string" || !Number.isFinite(item.time) ||
				typeof item.parent !== "number") {
				fail("DRIFT_DETECTED", `Hacker News comment ${id} is missing required fields`);
			}
			comments.push({
				id: item.id,
				author: item.by,
				createdAt: new Date(item.time * 1000).toISOString(),
				text: typeof item.text === "string" ? item.text : null,
				parentId: item.parent,
				depth,
				hnUrl: `https://news.ycombinator.com/item?id=${item.id}`
			});
			if (kids.length > 0) await visit(kids, depth + 1, item.id);
		}
	}

	await visit(rootKids, 0, rootId);
	if (totalComments > comments.length && comments.length >= limit) truncated = true;
	return {
		story: {
			id: root.id,
			title: root.title,
			url: storyUrl,
			hnUrl: `https://news.ycombinator.com/item?id=${root.id}`,
			author: root.by,
			createdAt: new Date(root.time * 1000).toISOString(),
			points: Number.isFinite(root.score) ? root.score : 0,
			text: typeof root.text === "string" ? root.text : null,
			isTextPost: storyUrl === null,
			totalComments
		},
		comments,
		returnedComments: comments.length,
		truncated
	};
}
